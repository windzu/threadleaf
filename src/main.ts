import { Plugin } from 'obsidian';

import { PageContextResolver } from './page-context/PageContextResolver';
import { FloatingAgentButton } from './ui/FloatingAgentButton';
import { ThreadleafView, VIEW_TYPE_THREADLEAF } from './ui/ThreadleafView';

export default class ThreadleafPlugin extends Plugin {
  private floatingButton: FloatingAgentButton | null = null;
  private pageContext: PageContextResolver | null = null;

  async onload(): Promise<void> {
    this.registerView(
      VIEW_TYPE_THREADLEAF,
      leaf => new ThreadleafView(leaf, () => this.pageContext?.getActivePage() ?? null),
    );

    this.pageContext = new PageContextResolver(this.app);
    this.pageContext.start();
    this.register(() => this.pageContext?.stop());

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
}
