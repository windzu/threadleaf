import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  ClipboardImageStore,
  extractClipboardImages,
  type ClipboardImageAdapter,
  type ClipboardImageLike,
  type ClipboardItemLike,
} from '../../src/storage/ClipboardImageStore';

class MemoryBinaryAdapter implements ClipboardImageAdapter {
  readonly directories = new Set<string>();
  readonly files = new Map<string, ArrayBuffer>();

  async exists(path: string): Promise<boolean> {
    return this.directories.has(path) || this.files.has(path);
  }

  async mkdir(path: string): Promise<void> {
    this.directories.add(path);
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    this.files.set(path, data.slice(0));
  }
}

function image(type: string, bytes: number[]): ClipboardImageLike {
  return {
    type,
    async arrayBuffer(): Promise<ArrayBuffer> {
      return Uint8Array.from(bytes).buffer;
    },
  };
}

describe('ClipboardImageStore', () => {
  it('extracts image files without treating clipboard text as an attachment', () => {
    const png = image('image/png', [1, 2, 3]);
    const items: ClipboardItemLike[] = [
      {
        kind: 'string',
        type: 'text/plain',
        getAsFile: () => null,
      },
      {
        kind: 'file',
        type: '',
        getAsFile: () => png,
      },
      {
        kind: 'file',
        type: 'application/pdf',
        getAsFile: () => image('application/pdf', [4]),
      },
    ];

    assert.deepEqual(extractClipboardImages(items), [png]);
  });

  it('persists clipboard bytes under a content-addressed Vault path', async () => {
    const adapter = new MemoryBinaryAdapter();
    let id = 0;
    const store = new ClipboardImageStore(adapter, () => `paste-${++id}`);
    const bytes = [1, 2, 3, 4];
    const digest = createHash('sha256')
      .update(Buffer.from(bytes))
      .digest('hex');
    const expectedPath = `.windy/attachments/${digest}.png`;

    const first = await store.save(image('image/png', bytes));
    const second = await store.save(image('image/png', bytes));

    assert.deepEqual(first, {
      id: 'paste-1',
      name: 'Pasted image.png',
      path: expectedPath,
      location: 'vault',
      mediaType: 'image/png',
      size: 4,
      source: 'paste',
    });
    assert.equal(second?.path, expectedPath);
    assert.deepEqual(
      Array.from(new Uint8Array(adapter.files.get(expectedPath)!)),
      bytes,
    );
    assert.deepEqual(
      [...adapter.directories].sort(),
      ['.windy', '.windy/attachments'],
    );
    assert.equal(adapter.files.size, 1);
  });

  it('rejects unsupported and empty clipboard images', async () => {
    const adapter = new MemoryBinaryAdapter();
    const store = new ClipboardImageStore(adapter);

    assert.equal(await store.save(image('image/tiff', [1])), null);
    assert.equal(await store.save(image('image/png', [])), null);
    assert.equal(adapter.files.size, 0);
  });
});
