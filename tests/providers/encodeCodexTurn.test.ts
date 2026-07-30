import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { encodeCodexTurn } from '../../src/providers/codex/prompt/encodeCodexTurn';

describe('encodeCodexTurn', () => {
  it('encodes the primary page and deduplicated additional page references', () => {
    const turn = encodeCodexTurn({
      text: 'Compare these designs',
      primaryPagePath: 'A.md',
      referencedPagePaths: ['B.md', 'A.md', 'B.md', 'Folder/C.base'],
    });

    assert.equal(turn.persistedContent, 'Compare these designs');
    assert.match(turn.prompt, /<linked_note>\nA\.md\n<\/linked_note>/);
    assert.match(
      turn.prompt,
      /<context_files>\nB\.md, Folder\/C\.base\n<\/context_files>/,
    );
    assert.equal(turn.prompt.match(/B\.md/g)?.length, 1);
  });

  it('keeps compact commands free of injected page context', () => {
    const turn = encodeCodexTurn({
      text: '/compact',
      primaryPagePath: 'A.md',
      referencedPagePaths: ['B.md'],
    });

    assert.equal(turn.prompt, '/compact');
  });
});
