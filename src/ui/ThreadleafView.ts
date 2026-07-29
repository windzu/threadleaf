import { ItemView, WorkspaceLeaf } from 'obsidian';

import type {
  PageConversationRoute,
  PageConversationRouter,
} from '../page-context/PageConversationRouter';

export const VIEW_TYPE_THREADLEAF = 'threadleaf-agent-view';

export class ThreadleafView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly router: PageConversationRouter,
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
    this.render(this.router.getRoute());
    this.register(this.router.onChange(route => this.render(route)));
  }

  private render(route: PageConversationRoute): void {
    const page = route.page;
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
    if (page) {
      this.contentEl.createEl('p', {
        cls: 'threadleaf-view__conversation-state',
        text: route.activeConversationId
          ? `Conversation: ${route.activeConversationId}`
          : 'No conversation for this page yet.',
      });
    }
  }
}
