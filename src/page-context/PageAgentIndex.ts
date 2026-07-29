import type { JsonStore } from '../storage/JsonFileStore';

export interface PageAgentRecord {
  conversationIds: string[];
  activeConversationId: string | null;
  updatedAt: number;
}

export interface PageAgentIndexDocument {
  version: 1;
  pages: Record<string, PageAgentRecord>;
}

export interface PageAgentIndexReconciliation {
  repairedPageCount: number;
  removedReferenceCount: number;
}

const EMPTY_DOCUMENT: PageAgentIndexDocument = {
  version: 1,
  pages: {},
};

function normalizePagePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
}

function cloneRecord(record: PageAgentRecord): PageAgentRecord {
  return {
    conversationIds: [...record.conversationIds],
    activeConversationId: record.activeConversationId,
    updatedAt: record.updatedAt,
  };
}

export class PageAgentIndex {
  private document: PageAgentIndexDocument = structuredClone(EMPTY_DOCUMENT);
  private initialized = false;

  constructor(
    private readonly store: JsonStore<PageAgentIndexDocument>,
    private readonly now: () => number = Date.now,
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const stored = await this.store.load();
    if (stored?.version === 1 && stored.pages && typeof stored.pages === 'object') {
      this.document = {
        version: 1,
        pages: Object.fromEntries(
          Object.entries(stored.pages).map(([path, record]) => [
            normalizePagePath(path),
            cloneRecord(record),
          ]),
        ),
      };
    }
    this.initialized = true;
  }

  get(pagePath: string): PageAgentRecord | null {
    this.assertInitialized();
    const record = this.document.pages[normalizePagePath(pagePath)];
    return record ? cloneRecord(record) : null;
  }

  async associate(
    pagePath: string,
    conversationId: string,
    makeActive = true,
  ): Promise<PageAgentRecord> {
    this.assertInitialized();
    const normalizedPath = normalizePagePath(pagePath);
    const current = this.document.pages[normalizedPath];
    const conversationIds = current
      ? [...current.conversationIds]
      : [];

    if (!conversationIds.includes(conversationId)) {
      conversationIds.push(conversationId);
    }

    const record: PageAgentRecord = {
      conversationIds,
      activeConversationId: makeActive
        ? conversationId
        : current?.activeConversationId ?? conversationIds[0] ?? null,
      updatedAt: this.now(),
    };
    this.document.pages[normalizedPath] = record;
    await this.persist();
    return cloneRecord(record);
  }

  async setActive(pagePath: string, conversationId: string): Promise<PageAgentRecord> {
    const record = this.get(pagePath);
    if (!record?.conversationIds.includes(conversationId)) {
      throw new Error(`Conversation "${conversationId}" is not associated with "${pagePath}".`);
    }
    return this.associate(pagePath, conversationId, true);
  }

  async migratePath(oldPath: string, newPath: string): Promise<void> {
    this.assertInitialized();
    const oldPrefix = normalizePagePath(oldPath);
    const newPrefix = normalizePagePath(newPath);
    const affected = Object.entries(this.document.pages)
      .filter(([path]) => path === oldPrefix || path.startsWith(`${oldPrefix}/`));

    if (affected.length === 0 || oldPrefix === newPrefix) {
      return;
    }

    for (const [sourcePath, sourceRecord] of affected) {
      const suffix = sourcePath.slice(oldPrefix.length);
      const destinationPath = `${newPrefix}${suffix}`;
      const destinationRecord = this.document.pages[destinationPath];
      this.document.pages[destinationPath] = destinationRecord
        ? this.mergeRecords(destinationRecord, sourceRecord)
        : cloneRecord(sourceRecord);
      delete this.document.pages[sourcePath];
    }
    await this.persist();
  }

  async reconcileConversationReferences(
    exists: (conversationId: string) => Promise<boolean>,
  ): Promise<PageAgentIndexReconciliation> {
    this.assertInitialized();
    const conversationIds = new Set(
      Object.values(this.document.pages)
        .flatMap(record => record.conversationIds),
    );
    const availability = new Map<string, boolean>();
    await Promise.all([...conversationIds].map(async conversationId => {
      try {
        availability.set(conversationId, await exists(conversationId));
      } catch {
        availability.set(conversationId, true);
      }
    }));

    let repairedPageCount = 0;
    let removedReferenceCount = 0;
    for (const [pagePath, record] of Object.entries(this.document.pages)) {
      const validIds = [...new Set(record.conversationIds)]
        .filter(id => availability.get(id) !== false);
      const removedFromRecord = record.conversationIds.length - validIds.length;
      const activeConversationId = record.activeConversationId
        && validIds.includes(record.activeConversationId)
        ? record.activeConversationId
        : validIds.at(-1) ?? null;
      const changed = validIds.length === 0
        || removedFromRecord > 0
        || activeConversationId !== record.activeConversationId;
      if (!changed) {
        continue;
      }

      repairedPageCount += 1;
      removedReferenceCount += removedFromRecord;
      if (validIds.length === 0) {
        delete this.document.pages[pagePath];
      } else {
        this.document.pages[pagePath] = {
          conversationIds: validIds,
          activeConversationId,
          updatedAt: this.now(),
        };
      }
    }

    if (repairedPageCount > 0) {
      await this.persist();
    }
    return { repairedPageCount, removedReferenceCount };
  }

  private mergeRecords(
    destination: PageAgentRecord,
    source: PageAgentRecord,
  ): PageAgentRecord {
    const conversationIds = [...destination.conversationIds];
    for (const conversationId of source.conversationIds) {
      if (!conversationIds.includes(conversationId)) {
        conversationIds.push(conversationId);
      }
    }

    const newer = source.updatedAt > destination.updatedAt ? source : destination;
    return {
      conversationIds,
      activeConversationId: newer.activeConversationId,
      updatedAt: Math.max(source.updatedAt, destination.updatedAt),
    };
  }

  private async persist(): Promise<void> {
    await this.store.save(structuredClone(this.document));
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('PageAgentIndex must be initialized before use.');
    }
  }
}
