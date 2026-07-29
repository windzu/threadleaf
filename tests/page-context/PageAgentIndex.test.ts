import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PageAgentIndex,
  type PageAgentIndexDocument,
} from '../../src/page-context/PageAgentIndex';
import type { JsonStore } from '../../src/storage/JsonFileStore';

class MemoryStore<T> implements JsonStore<T> {
  value: T | null;
  saveCount = 0;

  constructor(initial: T | null = null) {
    this.value = initial;
  }

  async load(): Promise<T | null> {
    return this.value ? structuredClone(this.value) : null;
  }

  async save(value: T): Promise<void> {
    this.saveCount += 1;
    this.value = structuredClone(value);
  }
}

describe('PageAgentIndex', () => {
  it('keeps every page conversation and restores the active one', async () => {
    let now = 100;
    const store = new MemoryStore<PageAgentIndexDocument>();
    const index = new PageAgentIndex(store, () => now++);
    await index.initialize();

    for (let conversation = 1; conversation <= 25; conversation += 1) {
      await index.associate('Notes/Page.md', `conversation-${conversation}`);
    }

    const record = index.get('Notes/Page.md');
    assert.equal(record?.conversationIds.length, 25);
    assert.equal(record?.activeConversationId, 'conversation-25');

    await index.setActive('Notes/Page.md', 'conversation-3');
    assert.equal(index.get('Notes/Page.md')?.activeConversationId, 'conversation-3');
  });

  it('migrates page and folder paths without losing conversations', async () => {
    let now = 100;
    const store = new MemoryStore<PageAgentIndexDocument>();
    const index = new PageAgentIndex(store, () => now++);
    await index.initialize();

    await index.associate('Projects/Alpha.md', 'alpha');
    await index.associate('Archive/Alpha.md', 'existing');
    await index.associate('Projects/Nested/Beta.base', 'beta');
    await index.migratePath('Projects', 'Archive');

    assert.equal(index.get('Projects/Alpha.md'), null);
    assert.deepEqual(
      index.get('Archive/Alpha.md')?.conversationIds,
      ['existing', 'alpha'],
    );
    assert.deepEqual(
      index.get('Archive/Nested/Beta.base')?.conversationIds,
      ['beta'],
    );
  });

  it('repairs missing references while preserving uncertain and orphaned data', async () => {
    const store = new MemoryStore<PageAgentIndexDocument>({
      version: 1,
      pages: {
        'A.md': {
          conversationIds: ['existing', 'missing', 'uncertain', 'existing'],
          activeConversationId: 'missing',
          updatedAt: 1,
        },
        'B.md': {
          conversationIds: ['missing'],
          activeConversationId: 'missing',
          updatedAt: 2,
        },
      },
    });
    const index = new PageAgentIndex(store, () => 100);
    await index.initialize();

    const result = await index.reconcileConversationReferences(async id => {
      if (id === 'uncertain') {
        throw new Error('Temporary adapter failure');
      }
      return id === 'existing';
    });

    assert.deepEqual(result, {
      repairedPageCount: 2,
      removedReferenceCount: 3,
    });
    assert.deepEqual(index.get('A.md'), {
      conversationIds: ['existing', 'uncertain'],
      activeConversationId: 'uncertain',
      updatedAt: 100,
    });
    assert.equal(index.get('B.md'), null);
    assert.equal(store.saveCount, 1);
  });
});
