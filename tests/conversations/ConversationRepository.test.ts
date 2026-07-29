import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Conversation } from '../../src/core/types';
import {
  CONVERSATION_DOCUMENT_VERSION,
} from '../../src/conversations/ConversationDocument';
import { ConversationRepository } from '../../src/conversations/ConversationRepository';
import { MemoryJsonFileAdapter } from '../helpers/MemoryJsonFileAdapter';

function conversation(id: string): Conversation {
  return {
    id,
    providerId: 'codex',
    title: 'Legacy conversation',
    createdAt: 100,
    updatedAt: 200,
    sessionId: 'thread-1',
    selectedModel: 'gpt-5.6-codex',
    messages: [],
  };
}

describe('ConversationRepository', () => {
  it('reads legacy documents and upgrades them on the next normal save', async () => {
    const path = '.threadleaf/conversations/legacy.json';
    const adapter = new MemoryJsonFileAdapter({
      [path]: JSON.stringify(conversation('legacy')),
    });
    const repository = new ConversationRepository(adapter);

    const loaded = await repository.load('legacy');
    assert.equal(loaded?.title, 'Legacy conversation');
    assert.deepEqual(adapter.readJson(path), conversation('legacy'));

    await repository.save(loaded!);
    const stored = adapter.readJson(path) as {
      version: number;
      conversation: Conversation;
    };
    assert.equal(stored.version, CONVERSATION_DOCUMENT_VERSION);
    assert.equal(stored.conversation.id, 'legacy');
    assert.equal(stored.conversation.sessionId, 'thread-1');
  });

  it('rejects unsupported versions and mismatched ids without modifying data', async () => {
    const versionedPath = '.threadleaf/conversations/future.json';
    const mismatchedPath = '.threadleaf/conversations/expected.json';
    const adapter = new MemoryJsonFileAdapter({
      [versionedPath]: JSON.stringify({
        version: 99,
        conversation: conversation('future'),
      }),
      [mismatchedPath]: JSON.stringify(conversation('different')),
    });
    const repository = new ConversationRepository(adapter);

    await assert.rejects(
      repository.load('future'),
      /unsupported schema version "99"/,
    );
    await assert.rejects(
      repository.load('expected'),
      /contains a different id/,
    );
    assert.equal(
      (adapter.readJson(versionedPath) as { version: number }).version,
      99,
    );
  });

  it('treats unsafe ids as unavailable instead of resolving outside storage', async () => {
    const repository = new ConversationRepository(
      new MemoryJsonFileAdapter(),
    );

    assert.equal(await repository.exists('../outside'), false);
    await assert.rejects(
      repository.load('../outside'),
      /Invalid conversation id/,
    );
  });
});
