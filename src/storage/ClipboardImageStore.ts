import { createHash, randomUUID } from 'node:crypto';

import type { DataAdapter } from 'obsidian';

import type { FileAttachment } from '../core/types';

const ATTACHMENT_DIRECTORY = '.windy/attachments';
const IMAGE_TYPES: Record<string, { extension: string; mediaType: string }> = {
  'image/gif': { extension: 'gif', mediaType: 'image/gif' },
  'image/jpeg': { extension: 'jpg', mediaType: 'image/jpeg' },
  'image/jpg': { extension: 'jpg', mediaType: 'image/jpeg' },
  'image/png': { extension: 'png', mediaType: 'image/png' },
  'image/webp': { extension: 'webp', mediaType: 'image/webp' },
};

export interface ClipboardImageLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  name?: string;
  type: string;
}

export interface ClipboardItemLike {
  getAsFile(): ClipboardImageLike | null;
  kind: string;
  type: string;
}

export type ClipboardImageAdapter = Pick<
  DataAdapter,
  'exists' | 'mkdir' | 'writeBinary'
>;

export function extractClipboardImages(
  items: Iterable<ClipboardItemLike>,
): ClipboardImageLike[] {
  const images: ClipboardImageLike[] = [];
  for (const item of items) {
    if (item.kind !== 'file') {
      continue;
    }
    const file = item.getAsFile();
    const mediaType = file?.type || item.type;
    if (file && mediaType.toLowerCase().startsWith('image/')) {
      images.push(file);
    }
  }
  return images;
}

export class ClipboardImageStore {
  constructor(
    private readonly adapter: ClipboardImageAdapter,
    private readonly createId: () => string = randomUUID,
  ) {}

  async save(image: ClipboardImageLike): Promise<FileAttachment | null> {
    const imageType = IMAGE_TYPES[image.type.trim().toLowerCase()];
    if (!imageType) {
      return null;
    }
    const data = await image.arrayBuffer();
    if (data.byteLength === 0) {
      return null;
    }
    const digest = createHash('sha256')
      .update(Buffer.from(data))
      .digest('hex');
    const path = `${ATTACHMENT_DIRECTORY}/${digest}.${imageType.extension}`;
    await this.ensureDirectory(ATTACHMENT_DIRECTORY);
    if (!await this.adapter.exists(path)) {
      await this.adapter.writeBinary(path, data);
    }
    return {
      id: this.createId(),
      name: `Pasted image.${imageType.extension}`,
      path,
      location: 'vault',
      mediaType: imageType.mediaType,
      size: data.byteLength,
      source: 'paste',
    };
  }

  private async ensureDirectory(path: string): Promise<void> {
    if (await this.adapter.exists(path)) {
      return;
    }
    const separatorIndex = path.lastIndexOf('/');
    const parentPath = separatorIndex >= 0 ? path.slice(0, separatorIndex) : '';
    if (parentPath) {
      await this.ensureDirectory(parentPath);
    }
    if (!await this.adapter.exists(path)) {
      await this.adapter.mkdir(path);
    }
  }
}
