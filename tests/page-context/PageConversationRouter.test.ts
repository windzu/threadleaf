import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PageAgentIndex,
  type PageAgentIndexDocument,
} from '../../src/page-context/PageAgentIndex';
import type {
  ActivePage,
  PageContextSource,
} from '../../src/page-context/PageContextResolver';
import { PageConversationRouter } from '../../src/page-context/PageConversationRouter';
import type { JsonStore } from '../../src/storage/JsonFileStore';

class MemoryStore<T> implements JsonStore<T> {
  value: T | null = null;

  async load(): Promise<T | null> {
    return this.value ? structuredClone(this.value) : null;
  }

  async save(value: T): Promise<void> {
    this.value = structuredClone(value);
  }
}

class FakePageContext implements PageContextSource {
  private page: ActivePage | null = null;
  private listeners = new Set<(page: ActivePage | null) => void>();

  getActivePage(): ActivePage | null {
    return this.page;
  }

  onChange(listener: (page: ActivePage | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  open(path: string): void {
    const filename = path.split('/').at(-1) ?? path;
    const extension = filename.split('.').at(-1) ?? '';
    this.page = {
      path,
      basename: filename.slice(0, -(extension.length + 1)),
      extension,
    };
    for (const listener of this.listeners) {
      listener(this.page);
    }
  }
}

describe('PageConversationRouter', () => {
  it('routes back to the last active conversation for each page', async () => {
    const index = new PageAgentIndex(
      new MemoryStore<PageAgentIndexDocument>(),
    );
    await index.initialize();
    const pageContext = new FakePageContext();
    const router = new PageConversationRouter(pageContext, index);
    router.start();

    pageContext.open('A.md');
    await router.associateConversation('a-1');
    await router.associateConversation('a-2');

    pageContext.open('B.base');
    assert.equal(router.getRoute().activeConversationId, null);
    await router.associateConversation('b-1');

    pageContext.open('A.md');
    assert.equal(router.getRoute().activeConversationId, 'a-2');
    assert.deepEqual(router.getRoute().conversationIds, ['a-1', 'a-2']);

    await router.selectConversation('a-1');
    pageContext.open('B.base');
    pageContext.open('A.md');
    assert.equal(router.getRoute().activeConversationId, 'a-1');
  });
});
