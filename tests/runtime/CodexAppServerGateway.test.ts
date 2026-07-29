import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProviderHost } from '../../src/core/providers/ProviderHost';
import {
  CodexAppServerGateway,
  type CodexAppServerTransport,
} from '../../src/providers/codex/runtime/CodexAppServerGateway';
import type { CodexAppServerProcess } from '../../src/providers/codex/runtime/CodexAppServerProcess';
import type { InitializeResult } from '../../src/providers/codex/runtime/codexAppServerTypes';
import type { CodexLaunchSpec } from '../../src/providers/codex/runtime/codexLaunchTypes';
import type { CodexRuntimeContext } from '../../src/providers/codex/runtime/CodexRuntimeContext';

type NotificationHandler = (params: unknown) => void;
type ServerRequestHandler = (
  requestId: string | number,
  params: unknown,
) => Promise<unknown>;

class FakeTransport implements CodexAppServerTransport {
  readonly notifications = new Map<string, NotificationHandler>();
  readonly serverRequests = new Map<string, ServerRequestHandler>();
  initializeRequests = 0;
  disposed = false;

  async request<T>(method: string): Promise<T> {
    if (method === 'initialize') {
      this.initializeRequests += 1;
    }
    return {} as T;
  }

  notify(): void {}

  onNotification(method: string, handler: NotificationHandler): void {
    this.notifications.set(method, handler);
  }

  onServerRequest(method: string, handler: ServerRequestHandler): void {
    this.serverRequests.set(method, handler);
  }

  dispose(): void {
    this.disposed = true;
  }
}

function createHarness(): {
  gateway: CodexAppServerGateway;
  transport: FakeTransport;
  processStarts: () => number;
  processShutdowns: () => number;
} {
  const transport = new FakeTransport();
  let starts = 0;
  let shutdowns = 0;
  const launchSpec = {
    command: 'codex',
    args: ['app-server'],
    spawnCwd: '/vault',
    targetCwd: '/vault',
    target: { method: 'native', platformFamily: 'unix', platformOs: 'macos' },
  } as unknown as CodexLaunchSpec;
  const process = {
    start(): void {
      starts += 1;
    },
    isAlive(): boolean {
      return starts > shutdowns;
    },
    async shutdown(): Promise<void> {
      shutdowns += 1;
    },
  } as CodexAppServerProcess;
  const runtimeContext = { launchSpec } as CodexRuntimeContext;

  return {
    gateway: new CodexAppServerGateway({} as ProviderHost, {
      async resolveLaunchSpec(): Promise<CodexLaunchSpec> {
        return launchSpec;
      },
      createProcess(): CodexAppServerProcess {
        return process;
      },
      createTransport(): CodexAppServerTransport {
        return transport;
      },
      createRuntimeContext(
        _spec: CodexLaunchSpec,
        _initializeResult: InitializeResult,
      ): CodexRuntimeContext {
        return runtimeContext;
      },
    }),
    transport,
    processStarts: () => starts,
    processShutdowns: () => shutdowns,
  };
}

describe('CodexAppServerGateway', () => {
  it('shares one process across concurrent readiness calls', async () => {
    const harness = createHarness();

    const [first, second] = await Promise.all([
      harness.gateway.ensureReady(),
      harness.gateway.ensureReady(),
    ]);

    assert.equal(harness.processStarts(), 1);
    assert.equal(harness.transport.initializeRequests, 1);
    assert.equal(first.generation, 1);
    assert.equal(first.runtimeContext, second.runtimeContext);

    await harness.gateway.cleanup();
    assert.equal(harness.processShutdowns(), 1);
    assert.equal(harness.transport.disposed, true);
  });

  it('increments the process generation after a forced restart', async () => {
    const harness = createHarness();

    const first = await harness.gateway.ensureReady();
    const second = await harness.gateway.ensureReady({ force: true });

    assert.equal(first.generation, 1);
    assert.equal(second.generation, 2);
    assert.equal(harness.processStarts(), 2);
    assert.equal(harness.processShutdowns(), 1);
  });

  it('broadcasts notifications and routes requests to the owning thread', async () => {
    const harness = createHarness();
    const notifications: string[] = [];
    harness.gateway.onNotification('turn/completed', params => {
      notifications.push(`a:${(params as { threadId: string }).threadId}`);
    });
    harness.gateway.onNotification('turn/completed', params => {
      notifications.push(`b:${(params as { threadId: string }).threadId}`);
    });
    harness.gateway.onServerRequest(
      'item/tool/requestUserInput',
      params => (params as { threadId: string }).threadId === 'thread-b',
      async () => ({ owner: 'b' }),
    );
    harness.gateway.onServerRequest(
      'item/tool/requestUserInput',
      params => (params as { threadId: string }).threadId === 'thread-a',
      async () => ({ owner: 'a' }),
    );
    await harness.gateway.ensureReady();

    harness.transport.notifications.get('turn/completed')?.({
      threadId: 'thread-a',
    });
    const result = await harness.transport.serverRequests
      .get('item/tool/requestUserInput')?.(1, { threadId: 'thread-b' });

    assert.deepEqual(notifications, ['a:thread-a', 'b:thread-a']);
    assert.deepEqual(result, { owner: 'b' });
  });
});
