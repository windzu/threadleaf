import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveConversationTitle } from '../../src/conversations/conversationTitle';

describe('deriveConversationTitle', () => {
  it('normalizes the first request into a readable title', () => {
    assert.equal(
      deriveConversationTitle('  Explain\n\n  the runtime architecture  '),
      'Explain the runtime architecture',
    );
  });

  it('truncates long titles without cutting past the limit', () => {
    const title = deriveConversationTitle('a'.repeat(80), 20);
    assert.equal(title, `${'a'.repeat(19)}…`);
    assert.equal(title.length, 20);
  });
});
