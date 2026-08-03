import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Conversation } from '../../src/core/types';
import {
  PageConversationService,
  type PageConversationController,
  type PageConversationRepository,
} from '../../src/page-context/PageConversationService';
import type { PageConversationRoute } from '../../src/page-context/PageConversationRouter';

function conversation(
  id: string,
  updatedAt: number,
  firstRequest?: string,
): Conversation {
  return {
    id,
    providerId: 'codex',
    title: 'New conversation',
    createdAt: 1,
    updatedAt,
    sessionId: null,
    selectedModel: 'test-model',
    messages: firstRequest
      ? [{
        id: `${id}-user`,
        role: 'user',
        content: firstRequest,
        timestamp: updatedAt,
      }]
      : [],
  };
}

function route(
  conversationIds: string[],
  activeConversationId: string | null,
): PageConversationRoute {
  return {
    page: {
      path: 'A.md',
      basename: 'A',
      extension: 'md',
    },
    conversationIds,
    activeConversationId,
  };
}

describe('PageConversationService', () => {
  it('loads useful, recent-first summaries for every page conversation', async () => {
    const stored = new Map<string, Conversation>([
      ['older', conversation('older', 10, 'Explain the planning architecture')],
      ['newer', conversation('newer', 20, 'Fix the runtime race')],
    ]);
    const repository: PageConversationRepository = {
      async create(): Promise<Conversation> {
        throw new Error('Unexpected create');
      },
      async load(conversationId: string): Promise<Conversation | null> {
        const item = stored.get(conversationId);
        return item ? structuredClone(item) : null;
      },
    };
    const controller: PageConversationController = {
      async associateConversationForPage(): Promise<void> {},
      async selectConversationForPage(): Promise<void> {},
    };
    const service = new PageConversationService(
      controller,
      repository,
    );

    const history = await service.getHistory(
      route(['older', 'missing', 'newer'], 'older'),
    );

    assert.equal(history?.activeConversationId, 'older');
    assert.deepEqual(
      history?.conversations.map(item => [item.id, item.title]),
      [
        ['newer', 'Fix the runtime race'],
        ['older', 'Explain the planning architecture'],
        ['missing', 'Conversation missing'],
      ],
    );
  });

  it('creates once for concurrent first sends and associates with the origin page', async () => {
    let createCount = 0;
    let releaseCreation = (): void => undefined;
    const creationGate = new Promise<void>(resolve => {
      releaseCreation = resolve;
    });
    const associations: Array<[string, string]> = [];
    const repository: PageConversationRepository = {
      async create(
        selectedModel?: string,
        selectedReasoningEffort?: string,
      ): Promise<Conversation> {
        createCount += 1;
        assert.equal(selectedModel, 'test-model');
        assert.equal(selectedReasoningEffort, 'high');
        await creationGate;
        return conversation('created', 30);
      },
      async load(): Promise<Conversation | null> {
        return null;
      },
    };
    const controller: PageConversationController = {
      async associateConversationForPage(
        pagePath: string,
        conversationId: string,
      ): Promise<void> {
        associations.push([pagePath, conversationId]);
      },
      async selectConversationForPage(): Promise<void> {},
    };
    const service = new PageConversationService(
      controller,
      repository,
    );

    const first = service.ensureConversationForPage(
      'Origin.md',
      'test-model',
      'high',
    );
    const second = service.ensureConversationForPage(
      'Origin.md',
      'test-model',
      'high',
    );
    releaseCreation();

    assert.deepEqual(await Promise.all([first, second]), ['created', 'created']);
    assert.equal(createCount, 1);
    assert.deepEqual(associations, [['Origin.md', 'created']]);
  });

  it('delegates selection without creating a conversation', async () => {
    const selections: string[] = [];
    const controller: PageConversationController = {
      async associateConversationForPage(): Promise<void> {},
      async selectConversationForPage(
        pagePath: string,
        conversationId: string,
      ): Promise<void> {
        selections.push(`${pagePath}:${conversationId}`);
      },
    };
    const repository: PageConversationRepository = {
      async create(): Promise<Conversation> {
        throw new Error('Unexpected create');
      },
      async load(): Promise<Conversation | null> {
        return null;
      },
    };
    const service = new PageConversationService(
      controller,
      repository,
    );

    await service.selectConversation('A.md', 'existing');

    assert.deepEqual(selections, ['A.md:existing']);
  });
});
