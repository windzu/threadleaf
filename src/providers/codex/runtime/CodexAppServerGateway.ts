import type { ProviderHost } from '../../../core/providers/ProviderHost';
import {
  resolveCodexAppServerLaunchSpec,
} from './codexAppServerSupport';
import { CodexAppServerProcess } from './CodexAppServerProcess';
import { createCodexRuntimeContext } from './CodexRuntimeContext';
import type { CodexRuntimeContext } from './CodexRuntimeContext';
import { CodexRpcTransport } from './CodexRpcTransport';
import type { InitializeResult } from './codexAppServerTypes';
import type { CodexLaunchSpec } from './codexLaunchTypes';

const CODEX_APP_SERVER_CLIENT_INFO = Object.freeze({
  name: 'windy',
  version: '1.0.0',
});

type NotificationHandler = (params: unknown) => void;
type ServerRequestHandler = (
  requestId: string | number,
  params: unknown,
) => Promise<unknown>;
type ServerRequestMatcher = (params: unknown) => boolean;

export interface CodexAppServerTransport {
  request<T = unknown>(
    method: string,
    params: unknown,
    timeoutMs?: number,
  ): Promise<T>;
  notify(method: string, params?: unknown): void;
  onNotification(method: string, handler: NotificationHandler): void;
  onServerRequest(method: string, handler: ServerRequestHandler): void;
  dispose(): void;
}

export interface CodexAppServerGatewayDependencies {
  resolveLaunchSpec(
    host: ProviderHost,
    forceTransitionOwner: boolean,
  ): Promise<CodexLaunchSpec>;
  createProcess(launchSpec: CodexLaunchSpec): CodexAppServerProcess;
  createTransport(process: CodexAppServerProcess): CodexAppServerTransport;
  createRuntimeContext(
    launchSpec: CodexLaunchSpec,
    initializeResult: InitializeResult,
  ): CodexRuntimeContext;
}

export interface CodexGatewayReadyState {
  restarted: boolean;
  generation: number;
  launchSpec: CodexLaunchSpec;
  runtimeContext: CodexRuntimeContext;
}

interface ServerRequestRegistration {
  handler: ServerRequestHandler;
  matches: ServerRequestMatcher;
}

const DEFAULT_DEPENDENCIES: CodexAppServerGatewayDependencies = {
  resolveLaunchSpec: (host, forceTransitionOwner) => resolveCodexAppServerLaunchSpec(
    host,
    'codex',
    forceTransitionOwner ? { providerTransitionOwner: true } : undefined,
  ),
  createProcess: launchSpec => new CodexAppServerProcess(launchSpec),
  createTransport: process => {
    const transport = new CodexRpcTransport(process);
    transport.start();
    return transport;
  },
  createRuntimeContext: createCodexRuntimeContext,
};

export class CodexAppServerGateway {
  private process: CodexAppServerProcess | null = null;
  private transport: CodexAppServerTransport | null = null;
  private launchSpec: CodexLaunchSpec | null = null;
  private runtimeContext: CodexRuntimeContext | null = null;
  private clientConfigKey: string | null = null;
  private readinessFlight: {
    key: string;
    promise: Promise<CodexGatewayReadyState>;
  } | null = null;
  private generation = 0;
  private notificationHandlers = new Map<string, Set<NotificationHandler>>();
  private serverRequestHandlers = new Map<string, Set<ServerRequestRegistration>>();
  private disposed = false;
  private lifecycleGeneration = 0;

  constructor(
    private readonly host: ProviderHost,
    private readonly dependencies: CodexAppServerGatewayDependencies = DEFAULT_DEPENDENCIES,
  ) {}

  async ensureReady(options?: {
    force?: boolean;
    providerTransitionOwner?: boolean;
  }): Promise<CodexGatewayReadyState> {
    if (this.disposed) {
      throw new Error('Codex app-server gateway has been disposed.');
    }
    const key = JSON.stringify(options ?? {});
    if (this.readinessFlight) {
      if (this.readinessFlight.key === key) {
        return this.readinessFlight.promise;
      }
      await this.readinessFlight.promise.catch(() => undefined);
      return this.ensureReady(options);
    }

    const flight = this.ensureReadyInternal(options, this.lifecycleGeneration);
    this.readinessFlight = { key, promise: flight };
    return flight.finally(() => {
      if (this.readinessFlight?.promise === flight) {
        this.readinessFlight = null;
      }
    });
  }

  request<T = unknown>(
    method: string,
    params: unknown,
    timeoutMs?: number,
  ): Promise<T> {
    if (!this.transport) {
      return Promise.reject(new Error('Codex app-server gateway is not ready.'));
    }
    return this.transport.request<T>(method, params, timeoutMs);
  }

  notify(method: string, params?: unknown): void {
    if (!this.transport) {
      throw new Error('Codex app-server gateway is not ready.');
    }
    this.transport.notify(method, params);
  }

  onNotification(method: string, handler: NotificationHandler): () => void {
    const handlers = this.notificationHandlers.get(method) ?? new Set();
    const isFirst = handlers.size === 0;
    handlers.add(handler);
    this.notificationHandlers.set(method, handlers);
    if (isFirst && this.transport) {
      this.wireNotificationMethod(this.transport, method);
    }
    return () => {
      const current = this.notificationHandlers.get(method);
      current?.delete(handler);
      if (current?.size === 0) {
        this.notificationHandlers.delete(method);
      }
    };
  }

  onServerRequest(
    method: string,
    matches: ServerRequestMatcher,
    handler: ServerRequestHandler,
  ): () => void {
    const handlers = this.serverRequestHandlers.get(method) ?? new Set();
    const isFirst = handlers.size === 0;
    const registration = { matches, handler };
    handlers.add(registration);
    this.serverRequestHandlers.set(method, handlers);
    if (isFirst && this.transport) {
      this.wireServerRequestMethod(this.transport, method);
    }
    return () => {
      const current = this.serverRequestHandlers.get(method);
      current?.delete(registration);
      if (current?.size === 0) {
        this.serverRequestHandlers.delete(method);
      }
    };
  }

  async cleanup(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.lifecycleGeneration += 1;
    this.notificationHandlers.clear();
    this.serverRequestHandlers.clear();
    await this.readinessFlight?.promise.catch(() => undefined);
    await this.shutdown();
  }

  private async ensureReadyInternal(
    options: {
      force?: boolean;
      providerTransitionOwner?: boolean;
    } | undefined,
    lifecycleGeneration: number,
  ): Promise<CodexGatewayReadyState> {
    const launchSpec = await this.dependencies.resolveLaunchSpec(
      this.host,
      options?.providerTransitionOwner === true,
    );
    this.assertLifecycleCurrent(lifecycleGeneration);
    const clientConfigKey = JSON.stringify({
      command: launchSpec.command,
      args: launchSpec.args,
      spawnCwd: launchSpec.spawnCwd,
      targetCwd: launchSpec.targetCwd,
      target: launchSpec.target,
    });
    const shouldRestart = !this.process
      || !this.transport
      || !this.process.isAlive()
      || options?.force === true
      || this.clientConfigKey !== clientConfigKey;

    if (shouldRestart) {
      await this.shutdown();
      try {
        this.process = this.dependencies.createProcess(launchSpec);
        this.process.start();
        this.transport = this.dependencies.createTransport(this.process);
        const initializeResult = await this.transport.request<InitializeResult>('initialize', {
          clientInfo: CODEX_APP_SERVER_CLIENT_INFO,
          capabilities: { experimentalApi: true },
        });
        this.transport.notify('initialized');
        this.assertLifecycleCurrent(lifecycleGeneration);
        this.launchSpec = launchSpec;
        this.runtimeContext = this.dependencies.createRuntimeContext(
          launchSpec,
          initializeResult,
        );
        this.clientConfigKey = clientConfigKey;
        this.generation += 1;
        this.wireHandlers(this.transport);
      } catch (error) {
        await this.shutdown();
        throw error;
      }
    }

    if (!this.launchSpec || !this.runtimeContext) {
      throw new Error('Codex app-server gateway failed to initialize.');
    }
    return {
      restarted: shouldRestart,
      generation: this.generation,
      launchSpec: this.launchSpec,
      runtimeContext: this.runtimeContext,
    };
  }

  private assertLifecycleCurrent(generation: number): void {
    if (this.disposed || generation !== this.lifecycleGeneration) {
      throw new Error('Codex app-server gateway has been disposed.');
    }
  }

  private wireHandlers(transport: CodexAppServerTransport): void {
    for (const method of this.notificationHandlers.keys()) {
      this.wireNotificationMethod(transport, method);
    }
    for (const method of this.serverRequestHandlers.keys()) {
      this.wireServerRequestMethod(transport, method);
    }
  }

  private wireNotificationMethod(
    transport: CodexAppServerTransport,
    method: string,
  ): void {
    transport.onNotification(method, params => {
      for (const handler of this.notificationHandlers.get(method) ?? []) {
        handler(params);
      }
    });
  }

  private wireServerRequestMethod(
    transport: CodexAppServerTransport,
    method: string,
  ): void {
    transport.onServerRequest(method, async (requestId, params) => {
      const registration = Array.from(
        this.serverRequestHandlers.get(method) ?? [],
      ).find(candidate => candidate.matches(params));
      if (!registration) {
        throw new Error(`No active conversation owns server request: ${method}`);
      }
      return registration.handler(requestId, params);
    });
  }

  private async shutdown(): Promise<void> {
    this.transport?.dispose();
    this.transport = null;
    if (this.process) {
      await this.process.shutdown();
      this.process = null;
    }
    this.launchSpec = null;
    this.runtimeContext = null;
    this.clientConfigKey = null;
  }
}
