export interface PageReference {
  path: string;
  basename: string;
  extension: string;
}

export type PageReferenceSource = () => readonly PageReference[];

const SUPPORTED_EXTENSIONS = new Set(['md', 'base']);

export class PageReferenceService {
  constructor(private readonly source: PageReferenceSource) {}

  search(
    rawQuery: string,
    excludedPaths: Iterable<string> = [],
    limit = 8,
  ): PageReference[] {
    const query = rawQuery.trim().toLocaleLowerCase();
    const excluded = new Set(excludedPaths);
    return this.source()
      .filter(page => (
        SUPPORTED_EXTENSIONS.has(page.extension)
        && !excluded.has(page.path)
      ))
      .map(page => ({
        page,
        score: this.score(page, query),
      }))
      .filter(result => result.score !== null)
      .sort((left, right) => (
        left.score! - right.score!
        || left.page.basename.localeCompare(right.page.basename)
        || left.page.path.localeCompare(right.page.path)
      ))
      .slice(0, limit)
      .map(result => ({ ...result.page }));
  }

  private score(page: PageReference, query: string): number | null {
    if (!query) {
      return 5;
    }
    const basename = page.basename.toLocaleLowerCase();
    const path = page.path.toLocaleLowerCase();
    if (basename === query || path === query) {
      return 0;
    }
    if (basename.startsWith(query)) {
      return 1;
    }
    if (path.split('/').some(segment => segment.startsWith(query))) {
      return 2;
    }
    if (basename.includes(query)) {
      return 3;
    }
    if (path.includes(query)) {
      return 4;
    }
    return null;
  }
}
