import { randomUUID } from 'node:crypto';

import type { ProviderHost } from '../core/providers/ProviderHost';
import type { ChatRuntime } from '../core/runtime/ChatRuntime';
import type { ApprovalCallbackOptions } from '../core/runtime/types';
import type {
  ApprovalDecision,
  ChatMessage,
  Conversation,
  StreamChunk,
} from '../core/types';
import type { ConversationStore } from '../conversations/ConversationRepository';

export type ConversationTaskStatus =
  | 'idle'
  | 'running'
  | 'waiting-approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export interface PendingApproval {
  toolName: string;
  input: Record<string, unknown>;
  description: string;
  options?: ApprovalCallbackOptions;
}

export interface ConversationRuntimeSnapshot {
  conversation: Conversation | null;
  status: ConversationTaskStatus;
  error: string | null;
  pendingApproval: PendingApproval | null;
}

export type RuntimeActivityStatus =
  | 'idle'
  | 'running'
  | 'waiting-approval'
  | 'completed'
  | 'failed'
  | 'interrupted';

export interface RuntimeActivitySummary {
  status: RuntimeActivityStatus;
  badgeCount: number;
  runningCount: number;
  waitingApprovalCount: number;
  failedCount: number;
  interruptedCount: number;
}

interface RuntimeEntry {
  runtime: ChatRuntime;
  conversation: Conversation | null;
  status: ConversationTaskStatus;
  error: string | null;
  pendingApproval: PendingApproval | null;
  resolveApproval: ((decision: ApprovalDecision) => void) | null;
  lastProgressPersistedAt: number;
}

type RuntimeListener = (
  conversationId: string,
  snapshot: ConversationRuntimeSnapshot,
) => void;

export class RuntimeCoordinator {
  private entries = new Map<string, RuntimeEntry>();
  private listeners = new Set<RuntimeListener>();
  private shuttingDown = false;

  constructor(
    private readonly host: ProviderHost,
    private readonly conversations: ConversationStore,
    private readonly createRuntime: (host: ProviderHost) => ChatRuntime,
    private readonly now: () => number = Date.now,
    private readonly progressPersistIntervalMs = 250,
  ) {}

  onChange(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async getSnapshot(conversationId: string): Promise<ConversationRuntimeSnapshot> {
    const entry = await this.ensureEntry(conversationId);
    return this.snapshot(entry);
  }

  getActivitySummary(activeConversationId: string | null): RuntimeActivitySummary {
    const statuses = Array.from(this.entries.values(), entry => entry.status);
    const runningCount = statuses.filter(
      status => status === 'running' || status === 'waiting-approval',
    ).length;
    const waitingApprovalCount = statuses.filter(
      status => status === 'waiting-approval',
    ).length;
    const failedCount = statuses.filter(status => status === 'failed').length;
    const interruptedCount = statuses.filter(
      status => status === 'interrupted',
    ).length;
    const activeStatus = activeConversationId
      ? this.entries.get(activeConversationId)?.status
      : undefined;

    if (waitingApprovalCount > 0) {
      return {
        status: 'waiting-approval',
        badgeCount: waitingApprovalCount,
        runningCount,
        waitingApprovalCount,
        failedCount,
        interruptedCount,
      };
    }
    if (runningCount > 0) {
      return {
        status: 'running',
        badgeCount: runningCount,
        runningCount,
        waitingApprovalCount,
        failedCount,
        interruptedCount,
      };
    }
    if (activeStatus === 'failed' || failedCount > 0) {
      return {
        status: 'failed',
        badgeCount: failedCount,
        runningCount,
        waitingApprovalCount,
        failedCount,
        interruptedCount,
      };
    }
    if (activeStatus === 'interrupted' || interruptedCount > 0) {
      return {
        status: 'interrupted',
        badgeCount: interruptedCount,
        runningCount,
        waitingApprovalCount,
        failedCount,
        interruptedCount,
      };
    }
    if (activeStatus === 'completed') {
      return {
        status: 'completed',
        badgeCount: 0,
        runningCount,
        waitingApprovalCount,
        failedCount,
        interruptedCount,
      };
    }
    return {
      status: 'idle',
      badgeCount: 0,
      runningCount,
      waitingApprovalCount,
      failedCount,
      interruptedCount,
    };
  }

  async send(
    conversationId: string,
    text: string,
    primaryPagePath: string,
  ): Promise<void> {
    await this.sendTurn(conversationId, text, primaryPagePath);
  }

  async retryInterrupted(conversationId: string): Promise<void> {
    const entry = await this.requireInterruptedEntry(conversationId);
    const state = entry.conversation!.activeTurn!;
    const userMessage = entry.conversation!.messages.find(
      message => message.id === state.userMessageId && message.role === 'user',
    );
    if (!userMessage) {
      throw new Error('The interrupted request is no longer available.');
    }
    await this.sendTurn(
      conversationId,
      userMessage.content,
      userMessage.primaryPagePath ?? state.primaryPagePath,
      userMessage.displayContent,
    );
  }

  async continueInterrupted(
    conversationId: string,
    primaryPagePath: string,
  ): Promise<void> {
    await this.requireInterruptedEntry(conversationId);
    await this.sendTurn(
      conversationId,
      'Continue from where the previous response was interrupted. '
        + 'Do not repeat work that is already complete.',
      primaryPagePath,
      'Continue',
    );
  }

  private async sendTurn(
    conversationId: string,
    text: string,
    primaryPagePath: string,
    displayContent?: string,
  ): Promise<void> {
    const entry = await this.ensureEntry(conversationId);
    if (entry.status === 'running' || entry.status === 'waiting-approval') {
      throw new Error('This conversation already has a running turn.');
    }
    if (!entry.conversation) {
      throw new Error(`Conversation "${conversationId}" does not exist.`);
    }

    const conversation = entry.conversation;
    const startedAt = this.now();
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: text,
      ...(displayContent ? { displayContent } : {}),
      timestamp: startedAt,
      primaryPagePath,
    };
    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: startedAt,
      contentBlocks: [],
      toolCalls: [],
    };
    conversation.messages.push(userMessage, assistantMessage);
    conversation.activeTurn = {
      status: 'running',
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      primaryPagePath,
      startedAt,
      updatedAt: startedAt,
    };
    entry.status = 'running';
    entry.error = null;
    entry.pendingApproval = null;
    entry.lastProgressPersistedAt = Number.NEGATIVE_INFINITY;
    await this.conversations.save(conversation);
    this.configureRuntimeCallbacks(conversationId, entry);
    entry.runtime.syncConversationState(conversation);
    this.emit(conversationId, entry);

    const turn = entry.runtime.prepareTurn({
      text,
      primaryPagePath,
    });

    try {
      for await (const chunk of entry.runtime.query(
        turn,
        conversation.messages.slice(0, -2),
        { model: conversation.selectedModel },
      )) {
        if (this.shuttingDown) {
          break;
        }
        this.applyChunk(assistantMessage, conversation, chunk);
        if (chunk.type === 'error') {
          entry.status = 'failed';
          entry.error = chunk.content;
        }
        await this.persistProgressIfDue(entry);
        this.emit(conversationId, entry);
      }

      if (this.shuttingDown) {
        return;
      }
      const sessionUpdates = entry.runtime.buildSessionUpdates({
        conversation,
        sessionInvalidated: entry.runtime.consumeSessionInvalidation(),
      });
      Object.assign(conversation, sessionUpdates.updates);
      conversation.lastResponseAt = this.now();
      delete conversation.activeTurn;
      await this.conversations.save(conversation);

      if (!(['failed', 'cancelled'] as ConversationTaskStatus[]).includes(entry.status)) {
        entry.status = 'completed';
      }
    } catch (error) {
      if (this.shuttingDown) {
        return;
      }
      entry.status = 'failed';
      entry.error = error instanceof Error ? error.message : String(error);
      if (!assistantMessage.content) {
        assistantMessage.content = entry.error;
      }
      this.captureSessionState(entry);
      delete conversation.activeTurn;
      await this.conversations.save(conversation);
    } finally {
      entry.pendingApproval = null;
      entry.resolveApproval = null;
      this.emit(conversationId, entry);
    }
  }

  respondToApproval(
    conversationId: string,
    decision: ApprovalDecision,
  ): void {
    const entry = this.entries.get(conversationId);
    if (!entry?.resolveApproval) {
      return;
    }
    const resolve = entry.resolveApproval;
    entry.resolveApproval = null;
    entry.pendingApproval = null;
    entry.status = 'running';
    if (entry.conversation?.activeTurn) {
      entry.conversation.activeTurn.status = 'running';
      entry.conversation.activeTurn.updatedAt = this.now();
      this.persistWithoutBlocking(entry.conversation);
    }
    this.emit(conversationId, entry);
    resolve(decision);
  }

  cancel(conversationId: string): void {
    const entry = this.entries.get(conversationId);
    if (!entry) {
      return;
    }
    entry.resolveApproval?.('cancel');
    entry.resolveApproval = null;
    entry.pendingApproval = null;
    entry.runtime.cancel();
    entry.status = 'cancelled';
    if (entry.conversation) {
      this.captureSessionState(entry);
      delete entry.conversation.activeTurn;
      this.persistWithoutBlocking(entry.conversation);
    }
    this.emit(conversationId, entry);
  }

  cleanup(): void {
    this.shuttingDown = true;
    for (const entry of this.entries.values()) {
      entry.resolveApproval?.('cancel');
      if (entry.conversation && this.markInterrupted(entry.conversation)) {
        this.captureSessionState(entry);
        this.persistWithoutBlocking(entry.conversation);
      }
      entry.runtime.cleanup();
    }
    this.entries.clear();
    this.listeners.clear();
  }

  private async ensureEntry(conversationId: string): Promise<RuntimeEntry> {
    let entry = this.entries.get(conversationId);
    if (entry) {
      return entry;
    }

    const conversation = await this.conversations.load(conversationId);
    let status: ConversationTaskStatus = 'idle';
    if (conversation?.activeTurn) {
      if (conversation.activeTurn.status !== 'interrupted') {
        this.markInterrupted(conversation);
        await this.conversations.save(conversation);
      }
      status = 'interrupted';
    }

    entry = {
      runtime: this.createRuntime(this.host),
      conversation,
      status,
      error: null,
      pendingApproval: null,
      resolveApproval: null,
      lastProgressPersistedAt: Number.NEGATIVE_INFINITY,
    };
    this.entries.set(conversationId, entry);
    return entry;
  }

  private configureRuntimeCallbacks(
    conversationId: string,
    entry: RuntimeEntry,
  ): void {
    entry.runtime.setApprovalCallback((toolName, input, description, options) => {
      return new Promise<ApprovalDecision>(resolve => {
        entry.pendingApproval = {
          toolName,
          input,
          description,
          options,
        };
        entry.resolveApproval = resolve;
        entry.status = 'waiting-approval';
        if (entry.conversation?.activeTurn) {
          entry.conversation.activeTurn.status = 'waiting-approval';
          entry.conversation.activeTurn.updatedAt = this.now();
          this.persistWithoutBlocking(entry.conversation);
        }
        this.emit(conversationId, entry);
      });
    });
    entry.runtime.setAskUserQuestionCallback(async () => ({}));
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
      assistantMessage.contentBlocks?.push({
        type: 'tool_use',
        toolId: chunk.id,
      });
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

  private async requireInterruptedEntry(
    conversationId: string,
  ): Promise<RuntimeEntry> {
    const entry = await this.ensureEntry(conversationId);
    if (
      entry.status !== 'interrupted'
      || !entry.conversation?.activeTurn
      || entry.conversation.activeTurn.status !== 'interrupted'
    ) {
      throw new Error('This conversation does not have an interrupted turn.');
    }
    return entry;
  }

  private async persistProgressIfDue(entry: RuntimeEntry): Promise<void> {
    const conversation = entry.conversation;
    const activeTurn = conversation?.activeTurn;
    if (!conversation || !activeTurn) {
      return;
    }
    const now = this.now();
    activeTurn.updatedAt = now;
    if (now - entry.lastProgressPersistedAt < this.progressPersistIntervalMs) {
      return;
    }
    entry.lastProgressPersistedAt = now;
    this.captureSessionState(entry);
    await this.conversations.save(conversation);
  }

  private markInterrupted(conversation: Conversation): boolean {
    const activeTurn = conversation.activeTurn;
    if (!activeTurn) {
      return false;
    }
    const interruptedAt = activeTurn.interruptedAt ?? this.now();
    activeTurn.status = 'interrupted';
    activeTurn.interruptedAt = interruptedAt;
    activeTurn.updatedAt = interruptedAt;
    const assistantMessage = conversation.messages.find(
      message => message.id === activeTurn.assistantMessageId
        && message.role === 'assistant',
    );
    if (assistantMessage) {
      assistantMessage.interruptedAt = interruptedAt;
      for (const toolCall of assistantMessage.toolCalls ?? []) {
        if (toolCall.status === 'running') {
          toolCall.status = 'blocked';
        }
      }
    }
    return true;
  }

  private persistWithoutBlocking(conversation: Conversation): void {
    void this.conversations.save(conversation).catch(() => undefined);
  }

  private captureSessionState(entry: RuntimeEntry): void {
    if (!entry.conversation) {
      return;
    }
    const sessionUpdates = entry.runtime.buildSessionUpdates({
      conversation: entry.conversation,
      sessionInvalidated: false,
    });
    Object.assign(entry.conversation, sessionUpdates.updates);
  }

  private snapshot(entry: RuntimeEntry): ConversationRuntimeSnapshot {
    return {
      conversation: entry.conversation
        ? structuredClone(entry.conversation)
        : null,
      status: entry.status,
      error: entry.error,
      pendingApproval: entry.pendingApproval
        ? structuredClone(entry.pendingApproval)
        : null,
    };
  }

  private emit(conversationId: string, entry: RuntimeEntry): void {
    const snapshot = this.snapshot(entry);
    for (const listener of this.listeners) {
      listener(conversationId, snapshot);
    }
  }
}
