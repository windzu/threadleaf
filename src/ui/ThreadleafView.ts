import { ItemView, WorkspaceLeaf } from 'obsidian';

import type { ActivePage } from '../page-context/PageContextResolver';

export const VIEW_TYPE_THREADLEAF = 'threadleaf-agent-view';

export class ThreadleafView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly getActivePage: () => ActivePage | null,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_THREADLEAF;
  }

  getDisplayText(): string {
    return 'Threadleaf';
  }

  getIcon(): string {
    return 'logo-crystal';
  }

  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.render()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.render()));
  }

  private render(): void {
    const page = this.getActivePage();
    this.contentEl.empty();
    this.contentEl.addClass('threadleaf-view');
    this.contentEl.createEl('div', {
      cls: 'threadleaf-view__eyebrow',
      text: 'PAGE AGENT',
    });
    this.contentEl.createEl('h2', {
      text: page?.basename ?? 'No active page',
    });
    this.contentEl.createEl('p', {
      cls: 'threadleaf-view__context',
      text: page
        ? `Context: ${page.path}`
        : 'Open a Markdown or Bases page to start a page-native conversation.',
    });
  }
}
