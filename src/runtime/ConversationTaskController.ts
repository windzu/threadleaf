import { randomUUID } from 'node:crypto';

import type { ChatRuntime } from '../core/runtime/ChatRuntime';
import type {
  ApprovalDecision,
  ChatMessage,
  Conversation,
  StreamChunk,
} from '../core/types';
import type { ConversationStore } from '../conversations/ConversationRepository';
import { deriveConversationTitle } from '../conversations/conversationTitle';
import { TurnCheckpointManager } from './TurnCheckpointManager';
import type {
  ConversationRuntimeSnapshot,
  ConversationTaskStatus,
  PendingApproval,
} from './types';

export class ConversationTaskController {
  private conversation: Conversation | null;
  private taskStatus: ConversationTaskStatus;
  private error: string | null = null;
  private pendingApproval: PendingApproval | null = null;
  private resolveApproval: ((decision: ApprovalDecision) => void) | null = null;
  private shuttingDown = false;
  private readonly checkpoints: TurnCheckpointManager;

  private constructor(
    private readonly conversations: ConversationStore,
    private readonly runtime: ChatRuntime,
    private readonly conversationId: string,
    conversation: Conversation | null,
    status: ConversationTaskStatus,
    private readonly now: () => number,
    progressPersistIntervalMs: number,
    private readonly onChange: (snapshot: ConversationRuntimeSnapshot) => void,
  ) {
    this.conversation = conversation;
    this.taskStatus = status;
    this.checkpoints = new TurnCheckpointManager(
      conversations,
      runtime,
      now,
      progressPersistIntervalMs,
    );
    this.configureRuntimeCallbacks();
  }

  static async create(options: {
    conversations: ConversationStore;
    createRuntime: () => ChatRuntime;
    conversationId: string;
    now: () => number;
    progressPersistIntervalMs: number;
    onChange: (snapshot: ConversationRuntimeSnapshot) => void;
  }): Promise<ConversationTaskController> {
    const conversation = await options.conversations.load(options.conversationId);
    const runtime = options.createRuntime();
    try {
      const controller = new ConversationTaskController(
        options.conversations,
        runtime,
        options.conversationId,
        conversation,
        'idle',
        options.now,
        options.progressPersistIntervalMs,
        options.onChange,
      );
      if (
        conversation
        && await controller.checkpoints.recoverInterrupted(conversation)
      ) {
        controller.taskStatus = 'interrupted';
      }
      return controller;
    } catch (error) {
      runtime.cleanup();
      throw error;
    }
  }

  get status(): ConversationTaskStatus {
    return this.taskStatus;
  }

  snapshot(): ConversationRuntimeSnapshot {
    return {
      conversation: this.conversation
        ? structuredClone(this.conversation)
        : null,
      status: this.taskStatus,
      error: this.error,
      pendingApproval: this.pendingApproval
        ? structuredClone(this.pendingApproval)
        : null,
    };
  }

  async send(
    text: string,
    primaryPagePath: string,
    displayContent?: string,
    referencedPagePaths: string[] = [],
  ): Promise<void> {
    if (this.taskStatus === 'running' || this.taskStatus === 'waiting-approval') {
      throw new Error('This conversation already has a running turn.');
    }
    if (!this.conversation) {
      throw new Error(`Conversation "${this.conversationId}" does not exist.`);
    }

    const conversation = this.conversation;
    const startedAt = this.now();
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: text,
      ...(displayContent ? { displayContent } : {}),
      timestamp: startedAt,
      primaryPagePath,
      ...(referencedPagePaths.length > 0
        ? { referencedPagePaths: [...new Set(referencedPagePaths)] }
        : {}),
    };
    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: startedAt,
      contentBlocks: [],
      toolCalls: [],
    };
    if (conversation.title === 'New conversation') {
      conversation.title = deriveConversationTitle(text);
    }
    conversation.messages.push(userMessage, assistantMessage);
    conversation.activeTurn = {
      status: 'running',
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      primaryPagePath,
      startedAt,
      updatedAt: startedAt,
    };
    this.taskStatus = 'running';
    this.error = null;
    this.pendingApproval = null;
    this.checkpoints.resetProgressClock();
    await this.conversations.save(conversation);
    this.runtime.syncConversationState(conversation);
    this.emit();

    const turn = this.runtime.prepareTurn({
      text,
      primaryPagePath,
      referencedPagePaths,
    });
    try {
      for await (const chunk of this.runtime.query(
        turn,
        conversation.messages.slice(0, -2),
        { model: conversation.selectedModel },
      )) {
        if (this.shuttingDown) {
          break;
        }
        this.applyChunk(assistantMessage, conversation, chunk);
        if (chunk.type === 'error') {
          this.taskStatus = 'failed';
          this.error = chunk.content;
        }
        await this.checkpoints.persistProgressIfDue(conversation);
        this.emit();
      }

      if (this.shuttingDown) {
        return;
      }
      const sessionUpdates = this.runtime.buildSessionUpdates({
        conversation,
        sessionInvalidated: this.runtime.consumeSessionInvalidation(),
      });
      Object.assign(conversation, sessionUpdates.updates);
      conversation.lastResponseAt = this.now();
      delete conversation.activeTurn;
      await this.conversations.save(conversation);
      if (
        !(['failed', 'cancelled'] as ConversationTaskStatus[])
          .includes(this.taskStatus)
      ) {
        this.taskStatus = 'completed';
      }
    } catch (error) {
      if (this.shuttingDown) {
        return;
      }
      this.taskStatus = 'failed';
      this.error = error instanceof Error ? error.message : String(error);
      if (!assistantMessage.content) {
        assistantMessage.content = this.error;
      }
      this.checkpoints.captureSessionState(conversation);
      delete conversation.activeTurn;
      await this.conversations.save(conversation);
    } finally {
      this.pendingApproval = null;
      this.resolveApproval = null;
      this.emit();
    }
  }

  async retryInterrupted(): Promise<void> {
    const state = this.requireInterruptedTurn();
    const userMessage = this.conversation!.messages.find(
      message => message.id === state.userMessageId && message.role === 'user',
    );
    if (!userMessage) {
      throw new Error('The interrupted request is no longer available.');
    }
    await this.send(
      userMessage.content,
      userMessage.primaryPagePath ?? state.primaryPagePath,
      userMessage.displayContent,
      userMessage.referencedPagePaths,
    );
  }

  async continueInterrupted(primaryPagePath: string): Promise<void> {
    this.requireInterruptedTurn();
    await this.send(
      'Continue from where the previous response was interrupted. '
        + 'Do not repeat work that is already complete.',
      primaryPagePath,
      'Continue',
    );
  }

  respondToApproval(decision: ApprovalDecision): void {
    if (!this.resolveApproval) {
      return;
    }
    const resolve = this.resolveApproval;
    this.resolveApproval = null;
    this.pendingApproval = null;
    this.taskStatus = 'running';
    if (this.conversation) {
      this.checkpoints.updateActiveStatus(this.conversation, 'running');
    }
    this.emit();
    resolve(decision);
  }

  async setModel(model: string | undefined): Promise<void> {
    if (this.taskStatus === 'running' || this.taskStatus === 'waiting-approval') {
      throw new Error('Cannot change the model while a turn is running.');
    }
    if (!this.conversation) {
      throw new Error(`Conversation "${this.conversationId}" does not exist.`);
    }
    if (model) {
      this.conversation.selectedModel = model;
    } else {
      delete this.conversation.selectedModel;
    }
    await this.conversations.save(this.conversation);
    this.runtime.syncConversationState(this.conversation);
    this.emit();
  }

  cancel(): void {
    this.resolveApproval?.('cancel');
    this.resolveApproval = null;
    this.pendingApproval = null;
    this.runtime.cancel();
    this.taskStatus = 'cancelled';
    if (this.conversation) {
      this.checkpoints.captureSessionState(this.conversation);
      delete this.conversation.activeTurn;
      this.checkpoints.persistWithoutBlocking(this.conversation);
    }
    this.emit();
  }

  cleanup(): void {
    this.shuttingDown = true;
    this.resolveApproval?.('cancel');
    if (this.conversation) {
      this.checkpoints.interruptAndPersist(this.conversation);
    }
    this.runtime.cleanup();
  }

  private requireInterruptedTurn(): NonNullable<Conversation['activeTurn']> {
    if (
      this.taskStatus !== 'interrupted'
      || !this.conversation?.activeTurn
      || this.conversation.activeTurn.status !== 'interrupted'
    ) {
      throw new Error('This conversation does not have an interrupted turn.');
    }
    return this.conversation.activeTurn;
  }

  private configureRuntimeCallbacks(): void {
    this.runtime.setApprovalCallback((toolName, input, description, options) => {
      return new Promise<ApprovalDecision>(resolve => {
        this.pendingApproval = { toolName, input, description, options };
        this.resolveApproval = resolve;
        this.taskStatus = 'waiting-approval';
        if (this.conversation) {
          this.checkpoints.updateActiveStatus(
            this.conversation,
            'waiting-approval',
          );
        }
        this.emit();
      });
    });
    this.runtime.setAskUserQuestionCallback(async () => ({}));
  }

  private applyChunk(
    assistantMessage: ChatMessage,
    conversation: Conversation,
    chunk: StreamChunk,
  ): void {
    if (chunk.type === 'text') {
      assistantMessage.content += chunk.content;
      assistantMessage.contentBlocks?.push({
        type: 'text',
        content: chunk.content,
      });
      return;
    }
    if (chunk.type === 'thinking') {
      assistantMessage.contentBlocks?.push({
        type: 'thinking',
        content: chunk.content,
      });
      return;
    }
    if (chunk.type === 'tool_use') {
      assistantMessage.toolCalls?.push({
        id: chunk.id,
        name: chunk.name,
        input: chunk.input,
        status: 'running',
        providerPayload: chunk.providerPayload,
      });
      assistantMessage.contentBlocks?.push({ type: 'tool_use', toolId: chunk.id });
      return;
    }
    if (chunk.type === 'tool_result' || chunk.type === 'tool_output') {
      const toolCall = assistantMessage.toolCalls?.find(call => call.id === chunk.id);
      if (toolCall) {
        toolCall.result = chunk.content;
        toolCall.status = chunk.type === 'tool_result' && chunk.isError
          ? 'error'
          : 'completed';
      }
      return;
    }
    if (chunk.type === 'usage') {
      conversation.usage = chunk.usage;
      if (chunk.sessionId) {
        conversation.sessionId = chunk.sessionId;
      }
      return;
    }
    if (chunk.type === 'context_compacted') {
      assistantMessage.contentBlocks?.push({ type: 'context_compacted' });
      return;
    }
    if (chunk.type === 'error') {
      assistantMessage.content += assistantMessage.content
        ? `\n\n${chunk.content}`
        : chunk.content;
    }
  }

  private emit(): void {
    this.onChange(this.snapshot());
  }
}
