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
  partialBeforeGate?: string;
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
      if (options.partialBeforeGate) {
        yield { type: 'text', content: options.partialBeforeGate };
      }
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
      interruptedCount: 0,
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
      interruptedCount: 0,
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
      interruptedCount: 0,
    });

    coordinator.respondToApproval('a', 'allow' satisfies ApprovalDecision);
    await task;
    const completed = await coordinator.getSnapshot('a');
    assert.equal(completed.status, 'completed');
    assert.equal(completed.conversation?.messages.at(-1)?.content, 'approved');
  });

  it('recovers persisted running output as interrupted and retries non-destructively', async () => {
    const gate = deferred();
    const sourceConversations = new Map([['a', conversation('a')]]);
    const sourceCoordinator = new RuntimeCoordinator(
      host,
      new MemoryConversationStore(sourceConversations),
      () => createFakeRuntime({
        gateByConversation: new Map([['a', gate.promise]]),
        partialBeforeGate: 'partial response',
      }),
    );

    const sourceTask = sourceCoordinator.send('a', 'original request', 'A.md');
    await new Promise(resolve => setImmediate(resolve));
    const persisted = structuredClone(sourceConversations.get('a')!);
    assert.equal(persisted.activeTurn?.status, 'running');
    assert.equal(persisted.messages.at(-1)?.content, 'partial response');
    assert.equal(persisted.sessionId, 'session:a');
    persisted.messages.at(-1)!.toolCalls = [{
      id: 'tool-1',
      name: 'command_execution',
      input: {},
      status: 'running',
    }];

    const recoveredConversations = new Map([['a', persisted]]);
    const recoveredCoordinator = new RuntimeCoordinator(
      host,
      new MemoryConversationStore(recoveredConversations),
      () => createFakeRuntime({}),
      () => 500,
    );
    const interrupted = await recoveredCoordinator.getSnapshot('a');
    assert.equal(interrupted.status, 'interrupted');
    assert.equal(interrupted.conversation?.activeTurn?.status, 'interrupted');
    assert.equal(interrupted.conversation?.messages.at(-1)?.content, 'partial response');
    assert.equal(interrupted.conversation?.messages.at(-1)?.interruptedAt, 500);
    assert.equal(
      interrupted.conversation?.messages.at(-1)?.toolCalls?.[0]?.status,
      'blocked',
    );
    assert.deepEqual(recoveredCoordinator.getActivitySummary('a'), {
      status: 'interrupted',
      badgeCount: 1,
      runningCount: 0,
      waitingApprovalCount: 0,
      failedCount: 0,
      interruptedCount: 1,
    });

    await recoveredCoordinator.retryInterrupted('a');
    const retried = await recoveredCoordinator.getSnapshot('a');
    assert.equal(retried.status, 'completed');
    assert.equal(retried.conversation?.messages.length, 4);
    assert.equal(retried.conversation?.messages.at(-2)?.content, 'original request');
    assert.equal(retried.conversation?.messages.at(-1)?.content, 'response:a');
    assert.equal(retried.conversation?.activeTurn, undefined);

    gate.resolve();
    await sourceTask;
  });

  it('continues an interrupted turn on the same conversation with explicit display text', async () => {
    const interrupted = conversation('a');
    interrupted.messages = [
      {
        id: 'user-1',
        role: 'user',
        content: 'long task',
        timestamp: 10,
        primaryPagePath: 'A.md',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'partial',
        timestamp: 10,
      },
    ];
    interrupted.activeTurn = {
      status: 'interrupted',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      primaryPagePath: 'A.md',
      startedAt: 10,
      updatedAt: 20,
      interruptedAt: 20,
    };
    const coordinator = new RuntimeCoordinator(
      host,
      new MemoryConversationStore(new Map([['a', interrupted]])),
      () => createFakeRuntime({}),
    );

    await coordinator.continueInterrupted('a', 'A.md');

    const completed = await coordinator.getSnapshot('a');
    const continuation = completed.conversation?.messages.at(-2);
    assert.equal(completed.status, 'completed');
    assert.equal(continuation?.displayContent, 'Continue');
    assert.match(continuation?.content ?? '', /Continue from where/);
    assert.equal(completed.conversation?.sessionId, 'session:a');
  });

  it('persists interruption during normal plugin cleanup', async () => {
    const gate = deferred();
    const conversations = new Map([['a', conversation('a')]]);
    const coordinator = new RuntimeCoordinator(
      host,
      new MemoryConversationStore(conversations),
      () => createFakeRuntime({
        gateByConversation: new Map([['a', gate.promise]]),
        partialBeforeGate: 'saved before cleanup',
      }),
    );

    const task = coordinator.send('a', 'work', 'A.md');
    await new Promise(resolve => setImmediate(resolve));
    coordinator.cleanup();
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(conversations.get('a')?.activeTurn?.status, 'interrupted');
    assert.equal(
      conversations.get('a')?.messages.at(-1)?.content,
      'saved before cleanup',
    );

    gate.resolve();
    await task;
    assert.equal(conversations.get('a')?.activeTurn?.status, 'interrupted');
  });

  it('deduplicates concurrent initialization for the same conversation', async () => {
    const conversations = new Map([['a', conversation('a')]]);
    const gate = deferred();
    let loadCount = 0;
    let runtimeCount = 0;
    const store: ConversationStore = {
      async load(conversationId: string): Promise<Conversation | null> {
        loadCount += 1;
        await gate.promise;
        const loaded = conversations.get(conversationId);
        return loaded ? structuredClone(loaded) : null;
      },
      async save(saved: Conversation): Promise<void> {
        conversations.set(saved.id, structuredClone(saved));
      },
    };
    const coordinator = new RuntimeCoordinator(host, store, () => {
      runtimeCount += 1;
      return createFakeRuntime({});
    });

    const snapshots = Promise.all([
      coordinator.getSnapshot('a'),
      coordinator.getSnapshot('a'),
    ]);
    gate.resolve();
    const [first, second] = await snapshots;

    assert.equal(first.conversation?.id, 'a');
    assert.equal(second.conversation?.id, 'a');
    assert.equal(loadCount, 1);
    assert.equal(runtimeCount, 1);
  });

  it('persists conversation model selection and clears it for Auto', async () => {
    const conversations = new Map([['a', conversation('a')]]);
    const coordinator = new RuntimeCoordinator(
      host,
      new MemoryConversationStore(conversations),
      () => createFakeRuntime({}),
    );

    await coordinator.setModel('a', 'gpt-5.6-terra');
    assert.equal(
      (await coordinator.getSnapshot('a')).conversation?.selectedModel,
      'gpt-5.6-terra',
    );

    await coordinator.setModel('a', undefined);
    assert.equal(
      (await coordinator.getSnapshot('a')).conversation?.selectedModel,
      undefined,
    );
  });

  it('names a new conversation from its first request', async () => {
    const conversations = new Map([['a', conversation('a')]]);
    conversations.get('a')!.title = 'New conversation';
    const coordinator = new RuntimeCoordinator(
      host,
      new MemoryConversationStore(conversations),
      () => createFakeRuntime({}),
    );

    await coordinator.send(
      'a',
      '  Explain\n the page conversation architecture  ',
      'A.md',
    );

    assert.equal(
      (await coordinator.getSnapshot('a')).conversation?.title,
      'Explain the page conversation architecture',
    );
  });
});
