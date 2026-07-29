import type { DataAdapter } from 'obsidian';
import { normalizePath } from 'obsidian';

export interface JsonStore<T> {
  load(): Promise<T | null>;
  save(value: T): Promise<void>;
}

export class JsonFileStore<T> implements JsonStore<T> {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly adapter: DataAdapter,
    private readonly path: string,
  ) {}

  async load(): Promise<T | null> {
    const normalizedPath = normalizePath(this.path);
    if (!await this.adapter.exists(normalizedPath)) {
      return null;
    }

    const contents = await this.adapter.read(normalizedPath);
    return JSON.parse(contents) as T;
  }

  save(value: T): Promise<void> {
    const snapshot = JSON.stringify(value, null, 2);
    const operation = this.writeQueue.then(async () => {
      const normalizedPath = normalizePath(this.path);
      const parentPath = normalizedPath.slice(0, normalizedPath.lastIndexOf('/'));
      if (parentPath && !await this.adapter.exists(parentPath)) {
        await this.adapter.mkdir(parentPath);
      }
      await this.adapter.write(normalizedPath, snapshot);
    });

    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
}
