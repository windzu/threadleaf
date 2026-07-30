import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PageReference } from '../../src/page-context/PageReferenceService';
import {
  attachPageReference,
  findPageMentionQuery,
  getReferencedPagePaths,
  insertInlinePageReference,
  reconcileInlinePageReferences,
  splitPageMentionText,
} from '../../src/ui/pageReferenceMentions';

const architecture: PageReference = {
  path: 'Projects/Architecture.md',
  basename: 'Architecture',
  extension: 'md',
};

const implementation: PageReference = {
  path: 'Projects/Implementation.md',
  basename: 'Implementation',
  extension: 'md',
};

describe('page reference mentions', () => {
  it('keeps an @ selection at its original sentence position', () => {
    const text = 'Use @Arch structure to revise this page';
    const result = insertInlinePageReference(
      text,
      { start: 4, end: 9 },
      architecture,
      [],
    );

    assert.equal(
      result.text,
      'Use @Projects/Architecture.md structure to revise this page',
    );
    assert.equal(result.caret, 29);
    assert.deepEqual(getReferencedPagePaths(result.references), [
      'Projects/Architecture.md',
    ]);
    assert.equal(result.references[0]?.placement, 'inline');
  });

  it('keeps plus-button context as a top attachment', () => {
    const references = attachPageReference([], implementation);

    assert.equal(references[0]?.placement, 'attached');
    assert.deepEqual(getReferencedPagePaths(references), [
      'Projects/Implementation.md',
    ]);
  });

  it('removes inline context when its mention is deleted', () => {
    const inline = insertInlinePageReference(
      '@Arch',
      { start: 0, end: 5 },
      architecture,
      [],
    ).references;
    const references = attachPageReference(inline, implementation);

    const reconciled = reconcileInlinePageReferences(
      'Compare the attached page only',
      references,
    );

    assert.deepEqual(getReferencedPagePaths(reconciled), [
      'Projects/Implementation.md',
    ]);
    assert.equal(reconciled[0]?.placement, 'attached');
  });

  it('segments inline references without exposing their path as plain text', () => {
    assert.deepEqual(
      splitPageMentionText(
        'Use @Projects/Architecture.md to revise @Projects/Implementation.md',
        [
          'Projects/Architecture.md',
          'Projects/Implementation.md',
        ],
      ),
      [
        { type: 'text', text: 'Use ' },
        { type: 'mention', path: 'Projects/Architecture.md' },
        { type: 'text', text: ' to revise ' },
        { type: 'mention', path: 'Projects/Implementation.md' },
      ],
    );
  });

  it('prefers the longest path when page mention names overlap', () => {
    assert.deepEqual(
      splitPageMentionText(
        '@Projects/OCC data.md',
        ['Projects/OCC', 'Projects/OCC data.md'],
      ),
      [{ type: 'mention', path: 'Projects/OCC data.md' }],
    );
  });

  it('finds mentions next to Chinese text without reopening completed tokens', () => {
    assert.deepEqual(
      findPageMentionQuery('参考@OCC', 6, []),
      { start: 2, end: 6, query: 'OCC' },
    );
    const completed = '参考@Projects/OCC数据.md 后继续';
    assert.equal(
      findPageMentionQuery(
        completed,
        completed.length,
        [{ start: 2, end: 20 }],
      ),
      null,
    );
    const repeated = `${completed} @Projects/OCC`;
    assert.deepEqual(
      findPageMentionQuery(
        repeated,
        repeated.length,
        [{ start: 2, end: 20 }],
      ),
      {
        start: completed.length + 1,
        end: repeated.length,
        query: 'Projects/OCC',
      },
    );
  });
});
