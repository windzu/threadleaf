import { randomUUID } from 'node:crypto';

import type { DataAdapter } from 'obsidian';

export interface JsonStore<T> {
  load(): Promise<T | null>;
  save(value: T): Promise<void>;
}

export type JsonFileAdapter = Pick<
  DataAdapter,
  'exists' | 'read' | 'write' | 'process' | 'mkdir' | 'rename' | 'remove'
>;

function normalizeStoragePath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

export class JsonFileStore<T> implements JsonStore<T> {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly adapter: JsonFileAdapter,
    private readonly path: string,
  ) {}

  async load(): Promise<T | null> {
    const normalizedPath = normalizeStoragePath(this.path);
    if (!await this.adapter.exists(normalizedPath)) {
      return null;
    }

    const contents = await this.adapter.read(normalizedPath);
    return JSON.parse(contents) as T;
  }

  save(value: T): Promise<void> {
    const snapshot = JSON.stringify(value, null, 2);
    const operation = this.writeQueue.then(async () => {
      const normalizedPath = normalizeStoragePath(this.path);
      const parentPath = normalizedPath.slice(0, normalizedPath.lastIndexOf('/'));
      await this.ensureDirectory(parentPath);
      if (await this.adapter.exists(normalizedPath)) {
        await this.adapter.process(normalizedPath, () => snapshot);
        return;
      }
      await this.createAtomically(normalizedPath, snapshot);
    });

    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private async createAtomically(path: string, snapshot: string): Promise<void> {
    const temporaryPath = `${path}.tmp-${randomUUID()}`;
    try {
      await this.adapter.write(temporaryPath, snapshot);
      if (await this.adapter.exists(path)) {
        await this.adapter.process(path, () => snapshot);
        await this.removeTemporaryFile(temporaryPath);
        return;
      }
      await this.adapter.rename(temporaryPath, path);
    } catch (error) {
      await this.removeTemporaryFile(temporaryPath);
      throw error;
    }
  }

  private async removeTemporaryFile(path: string): Promise<void> {
    try {
      if (await this.adapter.exists(path)) {
        await this.adapter.remove(path);
      }
    } catch {
      // A stale temp file is safer than masking the original write result.
    }
  }

  private async ensureDirectory(path: string): Promise<void> {
    if (!path || await this.adapter.exists(path)) {
      return;
    }

    const parentPath = path.slice(0, path.lastIndexOf('/'));
    await this.ensureDirectory(parentPath);
    if (!await this.adapter.exists(path)) {
      await this.adapter.mkdir(path);
    }
  }
}
