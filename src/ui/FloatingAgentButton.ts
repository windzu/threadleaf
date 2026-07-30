import { App, setIcon, setTooltip } from 'obsidian';

import type { RuntimeActivitySummary } from '../runtime/RuntimeCoordinator';
import { WINDY_NAV_ICON } from './icons';

const IDLE_ACTIVITY: RuntimeActivitySummary = {
  status: 'idle',
  badgeCount: 0,
  runningCount: 0,
  waitingApprovalCount: 0,
  failedCount: 0,
  interruptedCount: 0,
};

export class FloatingAgentButton {
  private element: HTMLButtonElement | null = null;
  private activity = IDLE_ACTIVITY;
  private visible = true;

  constructor(
    private readonly app: App,
    private readonly onClick: () => void,
  ) {}

  mount(): void {
    const workspaceContainer = this.app.workspace.containerEl;
    const pageLeaf = this.app.workspace.getMostRecentLeaf(
      this.app.workspace.rootSplit,
    );
    const pageContainer = pageLeaf?.view.containerEl ?? workspaceContainer;
    if (this.element?.isConnected && this.element.parentElement === pageContainer) {
      return;
    }
    this.unmount();

    const button = pageContainer.createEl('button', {
      cls: 'windy-floating-button',
      attr: {
        'aria-label': 'Open Windy for the current page',
        type: 'button',
      },
    });
    button.dataset.windyIcon = WINDY_NAV_ICON;
    setIcon(button, WINDY_NAV_ICON);
    button.addEventListener('click', this.onClick);
    this.element = button;
    this.renderVisibility();
    this.renderActivity();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.renderVisibility();
  }

  setActivity(activity: RuntimeActivitySummary): void {
    this.activity = activity;
    this.renderActivity();
  }

  unmount(): void {
    if (!this.element) {
      return;
    }
    this.element.removeEventListener('click', this.onClick);
    this.element.remove();
    this.element = null;
  }

  private renderActivity(): void {
    const button = this.element;
    if (!button) {
      return;
    }

    for (const status of [
      'idle',
      'running',
      'waiting-approval',
      'completed',
      'failed',
      'interrupted',
    ]) {
      button.removeClass(`windy-floating-button--${status}`);
    }
    button.addClass(`windy-floating-button--${this.activity.status}`);
    button.dataset.windyStatus = this.activity.status;

    button.querySelector('.windy-floating-button__badge')?.remove();
    if (this.activity.badgeCount > 0) {
      button.createSpan({
        cls: 'windy-floating-button__badge',
        text: this.activity.badgeCount > 9
          ? '9+'
          : String(this.activity.badgeCount),
      });
    }

    const label = this.getActivityLabel();
    button.setAttribute('aria-label', label);
    setTooltip(button, label);
  }

  private renderVisibility(): void {
    this.element?.toggleAttribute('hidden', !this.visible);
  }

  private getActivityLabel(): string {
    switch (this.activity.status) {
      case 'waiting-approval':
        return `${this.activity.waitingApprovalCount} Windy task${
          this.activity.waitingApprovalCount === 1 ? '' : 's'
        } need approval`;
      case 'running':
        return `${this.activity.runningCount} Windy task${
          this.activity.runningCount === 1 ? '' : 's'
        } running`;
      case 'failed':
        return `${this.activity.failedCount} Windy task${
          this.activity.failedCount === 1 ? '' : 's'
        } failed`;
      case 'interrupted':
        return `${this.activity.interruptedCount} Windy task${
          this.activity.interruptedCount === 1 ? '' : 's'
        } interrupted`;
      case 'completed':
        return 'Windy task completed';
      default:
        return 'Open Windy for the current page';
    }
  }
}
