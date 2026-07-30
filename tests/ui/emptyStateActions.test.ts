import assert from 'node:assert/strict';
import test from 'node:test';

import { EMPTY_STATE_ACTIONS } from '../../src/ui/emptyStateActions';

test('offers distinct explicit actions for a page-scoped draft', () => {
  assert.equal(EMPTY_STATE_ACTIONS.length, 4);
  assert.equal(
    new Set(EMPTY_STATE_ACTIONS.map(action => action.label)).size,
    EMPTY_STATE_ACTIONS.length,
  );
  assert.equal(
    new Set(EMPTY_STATE_ACTIONS.map(action => action.prompt)).size,
    EMPTY_STATE_ACTIONS.length,
  );
  for (const action of EMPTY_STATE_ACTIONS) {
    assert.ok(action.icon);
    assert.ok(action.label);
    assert.match(action.prompt, /\.$/);
  }
});
