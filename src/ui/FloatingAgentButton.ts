import { App, setIcon, setTooltip } from 'obsidian';

export class FloatingAgentButton {
  private element: HTMLButtonElement | null = null;

  constructor(
    private readonly app: App,
    private readonly onClick: () => void,
  ) {}

  mount(): void {
    const button = this.app.workspace.containerEl.createEl('button', {
      cls: 'threadleaf-floating-button',
      attr: {
        'aria-label': 'Open Threadleaf for the current page',
        type: 'button',
      },
    });
    setIcon(button, 'logo-crystal');
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
