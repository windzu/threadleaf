import type { PageReference } from '../page-context/PageReferenceService';

export type PageReferencePlacement = 'attached' | 'inline';

export interface ComposerPageReference {
  page: PageReference;
  placement: PageReferencePlacement;
}

export interface TextRange {
  start: number;
  end: number;
}

export interface InlinePageReferenceSelection {
  text: string;
  references: ComposerPageReference[];
  caret: number;
}

export function pageMentionToken(reference: PageReference): string {
  return `@${reference.path}`;
}

export function isInlinePageReference(text: string, path: string): boolean {
  return text.includes(`@${path}`);
}

export function insertInlinePageReference(
  text: string,
  range: TextRange,
  reference: PageReference,
  references: ComposerPageReference[],
): InlinePageReferenceSelection {
  const token = pageMentionToken(reference);
  const nextText = text.slice(0, range.start) + token + text.slice(range.end);
  return {
    text: nextText,
    references: [
      ...references.filter(item => item.page.path !== reference.path),
      { page: reference, placement: 'inline' },
    ],
    caret: range.start + token.length,
  };
}

export function attachPageReference(
  references: ComposerPageReference[],
  reference: PageReference,
): ComposerPageReference[] {
  if (references.some(item => item.page.path === reference.path)) {
    return references;
  }
  return [...references, { page: reference, placement: 'attached' }];
}

export function reconcileInlinePageReferences(
  text: string,
  references: ComposerPageReference[],
): ComposerPageReference[] {
  return references.filter(item => (
    item.placement === 'attached'
    || isInlinePageReference(text, item.page.path)
  ));
}

export function getReferencedPagePaths(
  references: ComposerPageReference[],
): string[] {
  return references.map(reference => reference.page.path);
}
