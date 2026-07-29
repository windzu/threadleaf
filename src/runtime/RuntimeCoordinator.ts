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
import { CodexChatRuntime } from '../providers/codex/runtime/CodexChatRuntime';

export type ConversationTaskStatus =
  | 'idle'
  | 'running'
  | 'waiting-approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

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
  | 'failed';

export interface RuntimeActivitySummary {
  status: RuntimeActivityStatus;
  badgeCount: number;
  runningCount: number;
  waitingApprovalCount: number;
  failedCount: number;
}

interface RuntimeEntry {
  runtime: ChatRuntime;
  conversation: Conversation | null;
  status: ConversationTaskStatus;
  error: string | null;
  pendingApproval: PendingApproval | null;
  resolveApproval: ((decision: ApprovalDecision) => void) | null;
}

type RuntimeListener = (
  conversationId: string,
  snapshot: ConversationRuntimeSnapshot,
) => void;

export class RuntimeCoordinator {
  private entries = new Map<string, RuntimeEntry>();
  private listeners = new Set<RuntimeListener>();

  constructor(
    private readonly host: ProviderHost,
    private readonly conversations: ConversationStore,
    private readonly createRuntime: (host: ProviderHost) => ChatRuntime = (
      providerHost,
    ) => new CodexChatRuntime(providerHost),
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
      };
    }
    if (runningCount > 0) {
      return {
        status: 'running',
        badgeCount: runningCount,
        runningCount,
        waitingApprovalCount,
        failedCount,
      };
    }
    if (activeStatus === 'failed' || failedCount > 0) {
      return {
        status: 'failed',
        badgeCount: failedCount,
        runningCount,
        waitingApprovalCount,
        failedCount,
      };
    }
    if (activeStatus === 'completed') {
      return {
        status: 'completed',
        badgeCount: 0,
        runningCount,
        waitingApprovalCount,
        failedCount,
      };
    }
    return {
      status: 'idle',
      badgeCount: 0,
      runningCount,
      waitingApprovalCount,
      failedCount,
    };
  }

  async send(
    conversationId: string,
    text: string,
    primaryPagePath: string,
  ): Promise<void> {
    const entry = await this.ensureEntry(conversationId);
    if (entry.status === 'running' || entry.status === 'waiting-approval') {
      throw new Error('This conversation already has a running turn.');
    }
    if (!entry.conversation) {
      throw new Error(`Conversation "${conversationId}" does not exist.`);
    }

    const conversation = entry.conversation;
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      primaryPagePath,
    };
    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      contentBlocks: [],
      toolCalls: [],
    };
    conversation.messages.push(userMessage, assistantMessage);
    await this.conversations.save(conversation);

    entry.status = 'running';
    entry.error = null;
    entry.pendingApproval = null;
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
        this.applyChunk(assistantMessage, conversation, chunk);
        if (chunk.type === 'error') {
          entry.status = 'failed';
          entry.error = chunk.content;
        }
        this.emit(conversationId, entry);
      }

      const sessionUpdates = entry.runtime.buildSessionUpdates({
        conversation,
        sessionInvalidated: entry.runtime.consumeSessionInvalidation(),
      });
      Object.assign(conversation, sessionUpdates.updates);
      conversation.lastResponseAt = Date.now();
      await this.conversations.save(conversation);

      if (!(['failed', 'cancelled'] as ConversationTaskStatus[]).includes(entry.status)) {
        entry.status = 'completed';
      }
    } catch (error) {
      entry.status = 'failed';
      entry.error = error instanceof Error ? error.message : String(error);
      if (!assistantMessage.content) {
        assistantMessage.content = entry.error;
      }
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
    this.emit(conversationId, entry);
  }

  cleanup(): void {
    for (const entry of this.entries.values()) {
      entry.resolveApproval?.('cancel');
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

    entry = {
      runtime: this.createRuntime(this.host),
      conversation: await this.conversations.load(conversationId),
      status: 'idle',
      error: null,
      pendingApproval: null,
      resolveApproval: null,
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
