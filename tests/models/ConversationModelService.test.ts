import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_WINDY_SETTINGS } from '../../src/app/settings';
import {
  CodexConversationModelService,
  type ConversationModelTarget,
  type ModelCatalogGateway,
} from '../../src/providers/codex/CodexConversationModelService';
import type {
  AppServerModel,
  ModelListResult,
} from '../../src/providers/codex/runtime/codexAppServerTypes';

function model(
  id: string,
  options: Partial<AppServerModel> = {},
): AppServerModel {
  return {
    id,
    model: id,
    displayName: id,
    description: `${id} description`,
    hidden: false,
    supportedReasoningEfforts: [
      {
        reasoningEffort: 'low',
        description: 'Faster responses',
      },
      {
        reasoningEffort: 'medium',
        description: 'Balanced reasoning',
      },
      {
        reasoningEffort: 'high',
        description: 'Deeper reasoning',
      },
    ],
    defaultReasoningEffort: 'medium',
    isDefault: false,
    ...options,
  };
}

describe('ConversationModelService', () => {
  it('loads the real paginated catalog once and hides unavailable models', async () => {
    let readyCount = 0;
    let requestCount = 0;
    const gateway: ModelCatalogGateway = {
      async ensureReady(): Promise<void> {
        readyCount += 1;
      },
      async request<T>(
        _method: string,
        params: { cursor?: string },
      ): Promise<T> {
        requestCount += 1;
        const result: ModelListResult = params.cursor
          ? {
            data: [model('gpt-5.6-terra')],
            nextCursor: null,
          }
          : {
            data: [
              model('gpt-5.6-sol', { isDefault: true }),
              model('hidden-model', { hidden: true }),
            ],
            nextCursor: 'next',
          };
        return result as T;
      },
    };
    const target: ConversationModelTarget = {
      async setModel(): Promise<void> {},
      async setReasoningEffort(): Promise<void> {},
    };
    const service = new CodexConversationModelService(
      gateway,
      target,
      structuredClone(DEFAULT_WINDY_SETTINGS),
    );

    const [first, second] = await Promise.all([
      service.getOptions(),
      service.getOptions(),
    ]);

    assert.deepEqual(
      first.map(option => [option.value, option.label]),
      [
        ['gpt-5.6-sol', 'GPT-5.6 Sol'],
        ['gpt-5.6-terra', 'GPT-5.6 Terra'],
      ],
    );
    assert.deepEqual(
      first[0]?.reasoningEfforts.map(option => [
        option.value,
        option.label,
        option.isDefault,
      ]),
      [
        ['low', 'Low', false],
        ['medium', 'Medium', true],
        ['high', 'High', false],
      ],
    );
    assert.deepEqual(second, first);
    assert.equal(readyCount, 1);
    assert.equal(requestCount, 2);
    await service.getOptions();
    assert.equal(requestCount, 2);
  });

  it('persists explicit selection and clears it for Auto', async () => {
    const updates: Array<[string, string | undefined]> = [];
    const gateway: ModelCatalogGateway = {
      async ensureReady(): Promise<void> {},
      async request<T>(): Promise<T> {
        return {
          data: [model('gpt-5.6-terra')],
          nextCursor: null,
        } as T;
      },
    };
    const target: ConversationModelTarget = {
      async setModel(
        conversationId: string,
        selectedModel: string | undefined,
      ): Promise<void> {
        updates.push([conversationId, selectedModel]);
      },
      async setReasoningEffort(): Promise<void> {},
    };
    const service = new CodexConversationModelService(
      gateway,
      target,
      structuredClone(DEFAULT_WINDY_SETTINGS),
    );

    await service.select('conversation-1', 'gpt-5.6-terra');
    await service.select('conversation-1', null);

    assert.deepEqual(updates, [
      ['conversation-1', 'gpt-5.6-terra'],
      ['conversation-1', undefined],
    ]);
    await assert.rejects(
      service.select('conversation-1', 'missing'),
      /not available/,
    );
  });

  it('uses model-scoped reasoning efforts and persists an explicit selection', async () => {
    const updates: Array<[string, string | undefined]> = [];
    const service = new CodexConversationModelService(
      {
        async ensureReady(): Promise<void> {},
        async request<T>(): Promise<T> {
          return {
            data: [model('gpt-5.6-sol')],
            nextCursor: null,
          } as T;
        },
      },
      {
        async setModel(): Promise<void> {},
        async setReasoningEffort(conversationId, reasoningEffort): Promise<void> {
          updates.push([conversationId, reasoningEffort]);
        },
      },
      structuredClone(DEFAULT_WINDY_SETTINGS),
    );

    const efforts = await service.getReasoningOptions('gpt-5.6-sol');
    assert.deepEqual(efforts.map(option => option.value), [
      'low',
      'medium',
      'high',
    ]);
    assert.equal(
      service.getReasoningSelectionLabel('gpt-5.6-sol', undefined),
      'Medium',
    );

    await service.selectReasoningEffort('conversation-1', 'gpt-5.6-sol', 'high');
    await service.selectReasoningEffort('conversation-1', 'gpt-5.6-sol', null);

    assert.deepEqual(updates, [
      ['conversation-1', 'high'],
      ['conversation-1', undefined],
    ]);
    await assert.rejects(
      service.selectReasoningEffort('conversation-1', 'gpt-5.6-sol', 'xhigh'),
      /not available for this model/,
    );
  });

  it('labels an unset selection as Auto with the configured default', () => {
    const service = new CodexConversationModelService(
      {
        async ensureReady(): Promise<void> {},
        async request<T>(): Promise<T> {
          throw new Error('Unexpected request');
        },
      },
      {
        async setModel(): Promise<void> {},
        async setReasoningEffort(): Promise<void> {},
      },
      structuredClone(DEFAULT_WINDY_SETTINGS),
    );

    assert.equal(service.getSelectionLabel(undefined), 'Auto');
    assert.match(service.getAutoDescription(), /GPT-5\.6 Sol/);
  });
});
