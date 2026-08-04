import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CODEX_DEFAULT_MODEL_SELECTION,
  DEFAULT_WINDY_SETTINGS,
  MODEL_DEFAULT_REASONING_SELECTION,
  mergeWindySettings,
} from '../../src/app/settings';

describe('Windy settings', () => {
  it('uses semantic defaults instead of hardcoded model values', () => {
    assert.equal(
      DEFAULT_WINDY_SETTINGS.newConversationModel,
      CODEX_DEFAULT_MODEL_SELECTION,
    );
    assert.equal(
      DEFAULT_WINDY_SETTINGS.newConversationReasoningEffort,
      MODEL_DEFAULT_REASONING_SELECTION,
    );
    assert.equal(DEFAULT_WINDY_SETTINGS.model, '');
    assert.equal(DEFAULT_WINDY_SETTINGS.effortLevel, '');
    assert.deepEqual(DEFAULT_WINDY_SETTINGS.savedProviderModel, {});
    assert.deepEqual(DEFAULT_WINDY_SETTINGS.savedProviderEffort, {});
  });

  it('adds semantic defaults while preserving legacy persisted behavior', () => {
    const settings = mergeWindySettings({
      model: 'legacy-model',
      effortLevel: 'medium',
    });

    assert.equal(settings.model, 'legacy-model');
    assert.equal(settings.effortLevel, 'medium');
    assert.equal(
      settings.newConversationModel,
      CODEX_DEFAULT_MODEL_SELECTION,
    );
    assert.equal(
      settings.newConversationReasoningEffort,
      MODEL_DEFAULT_REASONING_SELECTION,
    );
  });
});
