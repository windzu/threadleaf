import type { JsonFileAdapter } from '../../src/storage/JsonFileStore';

export class MemoryJsonFileAdapter implements JsonFileAdapter {
  readonly files = new Map<string, string>();
  readonly folders = new Set<string>();
  processCallCount = 0;
  renameCallCount = 0;
  failNextWrite = false;
  failNextProcess = false;

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [path, contents] of Object.entries(initialFiles)) {
      this.files.set(path, contents);
    }
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async read(path: string): Promise<string> {
    const contents = this.files.get(path);
    if (contents === undefined) {
      throw new Error(`Missing file: ${path}`);
    }
    return contents;
  }

  async write(path: string, data: string): Promise<void> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      this.files.set(path, data.slice(0, 1));
      throw new Error('Injected write failure');
    }
    this.files.set(path, data);
  }

  async process(path: string, fn: (data: string) => string): Promise<string> {
    this.processCallCount += 1;
    if (this.failNextProcess) {
      this.failNextProcess = false;
      throw new Error('Injected process failure');
    }
    const contents = fn(this.files.get(path) ?? '');
    this.files.set(path, contents);
    return contents;
  }

  async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }

  async rename(path: string, newPath: string): Promise<void> {
    this.renameCallCount += 1;
    const contents = this.files.get(path);
    if (contents === undefined) {
      throw new Error(`Missing file: ${path}`);
    }
    if (this.files.has(newPath)) {
      throw new Error(`File already exists: ${newPath}`);
    }
    this.files.delete(path);
    this.files.set(newPath, contents);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  readJson(path: string): unknown {
    const contents = this.files.get(path);
    return contents === undefined ? null : JSON.parse(contents);
  }
}
