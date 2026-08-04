import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import type { FileAttachment } from '../../src/core/types';
import {
  buildFileAttachment,
  isCodexImageAttachment,
  mergeFileAttachments,
  resolveFileAttachmentPath,
} from '../../src/utils/fileAttachment';

describe('file attachments', () => {
  it('stores vault files by relative path', async () => {
    const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'windy-vault-'));
    try {
      const filePath = path.join(vaultPath, 'Files', 'report.pdf');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'report');

      const attachment = await buildFileAttachment(
        { name: 'report.pdf', path: filePath, type: 'application/pdf' },
        { source: 'drop', vaultPath, createId: () => 'file-1' },
      );

      assert.deepEqual(attachment, {
        id: 'file-1',
        name: 'report.pdf',
        path: 'Files/report.pdf',
        location: 'vault',
        mediaType: 'application/pdf',
        size: 6,
        source: 'drop',
      });
      assert.equal(resolveFileAttachmentPath(attachment!, vaultPath), filePath);
    } finally {
      await fs.rm(vaultPath, { recursive: true, force: true });
    }
  });

  it('keeps external files as absolute paths and rejects unavailable items', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'windy-files-'));
    const vaultPath = path.join(root, 'vault');
    const externalPath = path.join(root, 'outside.xlsx');
    try {
      await fs.mkdir(vaultPath);
      await fs.writeFile(externalPath, 'sheet');

      const attachment = await buildFileAttachment(
        { name: 'outside.xlsx', path: externalPath },
        { source: 'picker', vaultPath, createId: () => 'file-2' },
      );

      assert.equal(attachment?.location, 'external');
      assert.equal(attachment?.path, externalPath);
      assert.equal(resolveFileAttachmentPath(attachment!, vaultPath), externalPath);
      assert.equal(await buildFileAttachment(
        { name: 'missing.zip', path: path.join(root, 'missing.zip') },
        { source: 'drop', vaultPath },
      ), null);
      assert.equal(await buildFileAttachment(
        { name: 'no-path.zip' },
        { source: 'drop', vaultPath },
      ), null);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('detects Codex-compatible images and deduplicates file paths', () => {
    const png: FileAttachment = {
      id: 'png-1',
      name: 'diagram.png',
      path: '/tmp/diagram.png',
      location: 'external',
      size: 10,
      source: 'drop',
    };
    const duplicate = { ...png, id: 'png-2', source: 'picker' as const };
    const archive: FileAttachment = {
      ...png,
      id: 'zip-1',
      name: 'bundle.zip',
      path: '/tmp/bundle.zip',
    };

    assert.equal(isCodexImageAttachment(png), true);
    assert.equal(isCodexImageAttachment(archive), false);
    assert.deepEqual(mergeFileAttachments([png], [duplicate, archive]), [png, archive]);
  });

  it('does not resolve vault paths that escape the vault', () => {
    const attachment: FileAttachment = {
      id: 'bad',
      name: 'secret.txt',
      path: '../secret.txt',
      location: 'vault',
      size: 1,
      source: 'drop',
    };
    assert.equal(resolveFileAttachmentPath(attachment, '/tmp/vault'), null);
  });
});
