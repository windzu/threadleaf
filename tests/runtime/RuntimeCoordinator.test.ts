import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProviderHost } from '../../src/core/providers/ProviderHost';
import type { ChatRuntime } from '../../src/core/runtime/ChatRuntime';
import type {
  ApprovalCallback,
  ChatTurnRequest,
  PreparedChatTurn,
} from '../../src/core/runtime/types';
import type {
  ApprovalDecision,
  Conversation,
  StreamChunk,
} from '../../src/core/types';
import type { ConversationStore } from '../../src/conversations/ConversationRepository';
import { RuntimeCoordinator } from '../../src/runtime/RuntimeCoordinator';

class MemoryConversationStore implements ConversationStore {
  constructor(private readonly conversations: Map<string, Conversation>) {}

  async load(conversationId: string): Promise<Conversation | null> {
    const conversation = this.conversations.get(conversationId);
    return conversation ? structuredClone(conversation) : null;
  }

  async save(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, structuredClone(conversation));
  }
}

function conversation(id: string): Conversation {
  return {
    id,
    providerId: 'codex',
    title: id,
    createdAt: 1,
    updatedAt: 1,
    sessionId: null,
    selectedModel: 'test-model',
    messages: [],
  };
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve = (): void => undefined;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function createFakeRuntime(options: {
  gateByConversation?: Map<string, Promise<void>>;
  approval?: boolean;
}): ChatRuntime {
  let conversationId = '';
  let approvalCallback: ApprovalCallback | null = null;
  let cancelled = false;

  const runtime = {
    syncConversationState(state: { id?: string } | null): void {
      conversationId = state?.id ?? '';
    },
    prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
      return {
        request,
        persistedContent: request.text,
        prompt: request.text,
        isCompact: false,
        mcpMentions: new Set(),
      };
    },
    async *query(): AsyncGenerator<StreamChunk> {
      await options.gateByConversation?.get(conversationId);
      if (options.approval && approvalCallback) {
        const decision = await approvalCallback(
          'command_execution',
          { command: 'test' },
          'Execute: test',
        );
        yield {
          type: 'text',
          content: decision === 'allow' ? 'approved' : 'denied',
        };
      } else if (!cancelled) {
        yield { type: 'text', content: `response:${conversationId}` };
      }
      yield { type: 'done' };
    },
    setApprovalCallback(callback: ApprovalCallback | null): void {
      approvalCallback = callback;
    },
    setAskUserQuestionCallback(): void {},
    buildSessionUpdates(): { updates: Partial<Conversation> } {
      return { updates: { sessionId: `session:${conversationId}` } };
    },
    consumeSessionInvalidation(): boolean {
      return false;
    },
    cancel(): void {
      cancelled = true;
    },
    cleanup(): void {},
  };
  return runtime as unknown as ChatRuntime;
}

const host = {} as ProviderHost;

describe('RuntimeCoordinator', () => {
  it('keeps a task running while another conversation completes', async () => {
    const gate = deferred();
    const conversations = new Map([
      ['a', conversation('a')],
      ['b', conversation('b')],
    ]);
    const store = new MemoryConversationStore(conversations);
    const coordinator = new RuntimeCoordinator(
      host,
      store,
      () => createFakeRuntime({
        gateByConversation: new Map([['a', gate.promise]]),
      }),
    );

    const taskA = coordinator.send('a', 'first', 'A.md');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await coordinator.getSnapshot('a')).status, 'running');
    assert.deepEqual(coordinator.getActivitySummary('a'), {
      status: 'running',
      badgeCount: 1,
      runningCount: 1,
      waitingApprovalCount: 0,
      failedCount: 0,
    });

    await coordinator.send('b', 'second', 'B.md');
    assert.equal((await coordinator.getSnapshot('b')).status, 'completed');
    assert.equal((await coordinator.getSnapshot('a')).status, 'running');
    assert.equal(coordinator.getActivitySummary('b').status, 'running');

    gate.resolve();
    await taskA;
    assert.equal((await coordinator.getSnapshot('a')).status, 'completed');
    assert.equal(
      (await coordinator.getSnapshot('a')).conversation?.messages.at(-1)?.content,
      'response:a',
    );
    assert.deepEqual(coordinator.getActivitySummary('b'), {
      status: 'completed',
      badgeCount: 0,
      runningCount: 0,
      waitingApprovalCount: 0,
      failedCount: 0,
    });
  });

  it('pauses a task for approval and resumes after the decision', async () => {
    const conversations = new Map([['a', conversation('a')]]);
    const coordinator = new RuntimeCoordinator(
      host,
      new MemoryConversationStore(conversations),
      () => createFakeRuntime({ approval: true }),
    );

    const task = coordinator.send('a', 'run command', 'A.md');
    await new Promise(resolve => setImmediate(resolve));
    const waiting = await coordinator.getSnapshot('a');
    assert.equal(waiting.status, 'waiting-approval');
    assert.equal(waiting.pendingApproval?.toolName, 'command_execution');
    assert.deepEqual(coordinator.getActivitySummary('a'), {
      status: 'waiting-approval',
      badgeCount: 1,
      runningCount: 1,
      waitingApprovalCount: 1,
      failedCount: 0,
    });

    coordinator.respondToApproval('a', 'allow' satisfies ApprovalDecision);
    await task;
    const completed = await coordinator.getSnapshot('a');
    assert.equal(completed.status, 'completed');
    assert.equal(completed.conversation?.messages.at(-1)?.content, 'approved');
  });
});
