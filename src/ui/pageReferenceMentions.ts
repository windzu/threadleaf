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

export interface PageMentionQuery extends TextRange {
  query: string;
}

export interface InlinePageReferenceSelection {
  text: string;
  references: ComposerPageReference[];
  caret: number;
}

export type PageMentionTextSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; path: string };

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

export function findPageMentionQuery(
  text: string,
  caret: number,
  confirmedRanges: TextRange[],
): PageMentionQuery | null {
  const beforeCursor = text.slice(0, caret);
  const start = beforeCursor.lastIndexOf('@');
  if (start < 0 || beforeCursor.slice(start).includes('\n')) {
    return null;
  }
  const startsWithConfirmedMention = confirmedRanges.some(
    range => range.start === start,
  );
  if (startsWithConfirmedMention) {
    return null;
  }
  return {
    start,
    end: caret,
    query: beforeCursor.slice(start + 1),
  };
}

export function splitPageMentionText(
  text: string,
  paths: string[],
): PageMentionTextSegment[] {
  const uniquePaths = [...new Set(paths)].filter(Boolean);
  if (text.length === 0 || uniquePaths.length === 0) {
    return text.length > 0 ? [{ type: 'text', text }] : [];
  }

  const segments: PageMentionTextSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let nextPath: string | null = null;
    let nextIndex = Number.POSITIVE_INFINITY;
    for (const path of uniquePaths) {
      const index = text.indexOf(`@${path}`, cursor);
      if (index < 0) {
        continue;
      }
      if (
        index < nextIndex
        || (index === nextIndex && path.length > (nextPath?.length ?? -1))
      ) {
        nextIndex = index;
        nextPath = path;
      }
    }
    if (!nextPath || !Number.isFinite(nextIndex)) {
      segments.push({ type: 'text', text: text.slice(cursor) });
      break;
    }
    if (nextIndex > cursor) {
      segments.push({
        type: 'text',
        text: text.slice(cursor, nextIndex),
      });
    }
    segments.push({ type: 'mention', path: nextPath });
    cursor = nextIndex + nextPath.length + 1;
  }
  return segments;
}
