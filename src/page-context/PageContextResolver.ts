import type { App, EventRef, TFile, WorkspaceLeaf } from 'obsidian';

export interface ActivePage {
  path: string;
  basename: string;
  extension: string;
  leaf: WorkspaceLeaf;
}

export class PageContextResolver {
  private activePage: ActivePage | null = null;
  private eventRefs: EventRef[] = [];

  constructor(private readonly app: App) {}

  start(): void {
    this.refresh();
    this.eventRefs.push(
      this.app.workspace.on('active-leaf-change', () => this.refresh()),
      this.app.workspace.on('file-open', () => this.refresh()),
    );
  }

  stop(): void {
    for (const eventRef of this.eventRefs) {
      this.app.workspace.offref(eventRef);
    }
    this.eventRefs = [];
  }

  getActivePage(): ActivePage | null {
    return this.activePage;
  }

  private refresh(): void {
    const leaf = this.app.workspace.getMostRecentLeaf();
    const file = this.app.workspace.getActiveFile();
    this.activePage = leaf && file ? this.toActivePage(file, leaf) : null;
  }

  private toActivePage(file: TFile, leaf: WorkspaceLeaf): ActivePage {
    return {
      path: file.path,
      basename: file.basename,
      extension: file.extension,
      leaf,
    };
  }
}
