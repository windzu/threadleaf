import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PageReferenceService } from '../../src/page-context/PageReferenceService';

describe('PageReferenceService', () => {
  const service = new PageReferenceService(() => [
    { path: 'Projects/Runtime architecture.md', basename: 'Runtime architecture', extension: 'md' },
    { path: 'Projects/Runtime tests.md', basename: 'Runtime tests', extension: 'md' },
    { path: 'Notes/Architecture review.md', basename: 'Architecture review', extension: 'md' },
    { path: 'Databases/Projects.base', basename: 'Projects', extension: 'base' },
    { path: 'attachments/runtime.png', basename: 'runtime', extension: 'png' },
  ]);

  it('ranks basename prefixes before looser path matches', () => {
    assert.deepEqual(
      service.search('runtime').map(page => page.path),
      [
        'Projects/Runtime architecture.md',
        'Projects/Runtime tests.md',
        'attachments/runtime.png',
      ].slice(0, 2),
    );
  });

  it('supports Markdown and Bases pages while excluding attached paths', () => {
    assert.deepEqual(
      service.search('', ['Projects/Runtime architecture.md']).map(page => page.path),
      [
        'Notes/Architecture review.md',
        'Databases/Projects.base',
        'Projects/Runtime tests.md',
      ],
    );
  });
});
