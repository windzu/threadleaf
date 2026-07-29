import { Plugin } from 'obsidian';

import {
  PageAgentIndex,
  type PageAgentIndexDocument,
} from './page-context/PageAgentIndex';
import { PageContextResolver } from './page-context/PageContextResolver';
import { PageConversationRouter } from './page-context/PageConversationRouter';
import { JsonFileStore } from './storage/JsonFileStore';
import { FloatingAgentButton } from './ui/FloatingAgentButton';
import { ThreadleafView, VIEW_TYPE_THREADLEAF } from './ui/ThreadleafView';

export default class ThreadleafPlugin extends Plugin {
  private floatingButton: FloatingAgentButton | null = null;
  private pageContext: PageContextResolver | null = null;
  private pageIndex: PageAgentIndex | null = null;
  private router: PageConversationRouter | null = null;

  async onload(): Promise<void> {
    const pageIndexStore = new JsonFileStore<PageAgentIndexDocument>(
      this.app.vault.adapter,
      '.threadleaf/page-agent-index.json',
    );
    this.pageIndex = new PageAgentIndex(pageIndexStore);
    await this.pageIndex.initialize();

    this.pageContext = new PageContextResolver(this.app);
    this.router = new PageConversationRouter(this.pageContext, this.pageIndex);

    this.registerView(
      VIEW_TYPE_THREADLEAF,
      leaf => new ThreadleafView(leaf, this.requireRouter()),
    );

    this.pageContext.start();
    this.router.start();
    this.register(() => this.pageContext?.stop());
    this.register(() => this.router?.stop());
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (!this.pageIndex || !this.router) {
          return;
        }
        void this.pageIndex.migratePath(oldPath, file.path).then(() => {
          this.router?.refresh();
        });
      }),
    );

    this.floatingButton = new FloatingAgentButton(this.app, () => {
      void this.openAgent();
    });
    this.floatingButton.mount();
    this.register(() => this.floatingButton?.unmount());

    this.addCommand({
      id: 'open-page-agent',
      name: 'Open agent for current page',
      callback: () => {
        void this.openAgent();
      },
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_THREADLEAF);
  }

  private async openAgent(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_THREADLEAF)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      return;
    }

    await leaf.setViewState({
      type: VIEW_TYPE_THREADLEAF,
      active: true,
    });
    this.app.workspace.revealLeaf(leaf);
  }

  private requireRouter(): PageConversationRouter {
    if (!this.router) {
      throw new Error('Threadleaf page conversation router is not initialized.');
    }
    return this.router;
  }
}
