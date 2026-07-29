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

  it('reads version 1 envelopes and upgrades them to the current version', async () => {
    const path = '.threadleaf/conversations/v1.json';
    const adapter = new MemoryJsonFileAdapter({
      [path]: JSON.stringify({
        version: 1,
        conversation: conversation('v1'),
      }),
    });
    const repository = new ConversationRepository(adapter);

    const loaded = await repository.load('v1');
    assert.equal(loaded?.id, 'v1');
    await repository.save(loaded!);

    assert.equal(
      (adapter.readJson(path) as { version: number }).version,
      CONVERSATION_DOCUMENT_VERSION,
    );
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

  it('rejects malformed persisted turn state', async () => {
    const path = '.threadleaf/conversations/malformed.json';
    const malformed = conversation('malformed');
    malformed.activeTurn = {
      status: 'running',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      primaryPagePath: 'A.md',
      startedAt: Number.NaN,
      updatedAt: 2,
    };
    const adapter = new MemoryJsonFileAdapter({
      [path]: JSON.stringify({
        version: CONVERSATION_DOCUMENT_VERSION,
        conversation: malformed,
      }),
    });
    const repository = new ConversationRepository(adapter);

    await assert.rejects(
      repository.load('malformed'),
      /invalid schema/,
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
