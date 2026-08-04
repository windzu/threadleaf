import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { FileAttachment } from '../core/types';
import { isPathWithinVault } from './path';

const CODEX_IMAGE_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);
const CODEX_IMAGE_MEDIA_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export interface NativeFileLike {
  name: string;
  path?: string;
  size?: number;
  type?: string;
}

export interface BuildFileAttachmentOptions {
  source: FileAttachment['source'];
  vaultPath: string | null;
  createId?: () => string;
}

export interface BuildFileAttachmentsResult {
  attachments: FileAttachment[];
  rejected: string[];
}

export async function buildFileAttachments(
  files: Iterable<NativeFileLike>,
  options: BuildFileAttachmentOptions,
): Promise<BuildFileAttachmentsResult> {
  const attachments: FileAttachment[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    const attachment = await buildFileAttachment(file, options);
    if (attachment) {
      attachments.push(attachment);
    } else {
      rejected.push(file.name || 'Unnamed file');
    }
  }
  return { attachments, rejected };
}

export async function buildFileAttachment(
  file: NativeFileLike,
  options: BuildFileAttachmentOptions,
): Promise<FileAttachment | null> {
  const nativePath = resolveNativeFilePath(file);
  if (!nativePath || !path.isAbsolute(nativePath)) {
    return null;
  }

  const absolutePath = path.resolve(nativePath);
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(absolutePath);
  } catch {
    return null;
  }
  if (!stat.isFile()) {
    return null;
  }

  const vaultPath = options.vaultPath ? path.resolve(options.vaultPath) : null;
  const inVault = vaultPath !== null && isPathWithinVault(absolutePath, vaultPath);
  const storedPath = inVault
    ? path.relative(vaultPath, absolutePath).replace(/\\/g, '/')
    : absolutePath;
  if (!storedPath) {
    return null;
  }

  const mediaType = file.type?.trim().toLowerCase();
  return {
    id: options.createId?.() ?? randomUUID(),
    name: file.name.trim() || path.basename(absolutePath),
    path: storedPath,
    location: inVault ? 'vault' : 'external',
    ...(mediaType ? { mediaType } : {}),
    size: stat.size,
    source: options.source,
  };
}

function resolveNativeFilePath(file: NativeFileLike): string | null {
  if (typeof file.path === 'string' && file.path.trim()) {
    return file.path;
  }
  if (typeof window === 'undefined') {
    return null;
  }

  const runtimeWindow = window as Window & {
    require?: (moduleName: string) => unknown;
  };
  try {
    const electron = runtimeWindow.require?.('electron') as {
      webUtils?: { getPathForFile?: (value: unknown) => string };
    } | undefined;
    const resolved = electron?.webUtils?.getPathForFile?.(file);
    return typeof resolved === 'string' && resolved.trim() ? resolved : null;
  } catch {
    return null;
  }
}

export function resolveFileAttachmentPath(
  attachment: FileAttachment,
  vaultPath: string | null | undefined,
): string | null {
  if (attachment.location === 'external') {
    return path.isAbsolute(attachment.path) ? path.normalize(attachment.path) : null;
  }
  if (!vaultPath || path.isAbsolute(attachment.path)) {
    return null;
  }
  const root = path.resolve(vaultPath);
  const resolved = path.resolve(root, ...attachment.path.split('/'));
  return isPathWithinVault(resolved, root) ? resolved : null;
}

export function isCodexImageAttachment(attachment: FileAttachment): boolean {
  const mediaType = attachment.mediaType?.trim().toLowerCase();
  return Boolean(
    (mediaType && CODEX_IMAGE_MEDIA_TYPES.has(mediaType))
    || CODEX_IMAGE_EXTENSIONS.has(path.extname(attachment.name).toLowerCase()),
  );
}

export function mergeFileAttachments(
  current: readonly FileAttachment[],
  incoming: readonly FileAttachment[],
): FileAttachment[] {
  const merged = [...current];
  const keys = new Set(current.map(fileAttachmentKey));
  for (const attachment of incoming) {
    const key = fileAttachmentKey(attachment);
    if (!keys.has(key)) {
      keys.add(key);
      merged.push(attachment);
    }
  }
  return merged;
}

function fileAttachmentKey(attachment: FileAttachment): string {
  const value = `${attachment.location}:${attachment.path}`;
  return process.platform === 'win32' ? value.toLowerCase() : value;
}
