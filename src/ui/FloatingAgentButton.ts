import { App, getIconIds, setIcon, setTooltip } from 'obsidian';

export class FloatingAgentButton {
  private element: HTMLButtonElement | null = null;

  constructor(
    private readonly app: App,
    private readonly onClick: () => void,
  ) {}

  mount(): void {
    const workspaceContainer = this.app.workspace.containerEl;
    const pageContainer = workspaceContainer.querySelector<HTMLElement>(
      '.workspace-split.mod-root .workspace-leaf.mod-active .workspace-leaf-content',
    ) ?? workspaceContainer;
    if (this.element?.isConnected && this.element.parentElement === pageContainer) {
      return;
    }
    this.unmount();

    const button = pageContainer.createEl('button', {
      cls: 'threadleaf-floating-button',
      attr: {
        'aria-label': 'Open Threadleaf for the current page',
        type: 'button',
      },
    });
    const availableIcons = new Set(getIconIds());
    const iconId = availableIcons.has('logo-crystal')
      ? 'logo-crystal'
      : availableIcons.has('obsidian')
        ? 'obsidian'
        : 'gem';
    button.dataset.threadleafIcon = iconId;
    setIcon(button, iconId);
    setTooltip(button, 'Open Threadleaf');
    button.addEventListener('click', this.onClick);
    this.element = button;
  }

  unmount(): void {
    if (!this.element) {
      return;
    }
    this.element.removeEventListener('click', this.onClick);
    this.element.remove();
    this.element = null;
  }
}
