import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PageReference } from '../../src/page-context/PageReferenceService';
import {
  attachPageReference,
  getReferencedPagePaths,
  insertInlinePageReference,
  reconcileInlinePageReferences,
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
});
