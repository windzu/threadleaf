import { Notice, setIcon, setTooltip } from 'obsidian';

import type { PermissionMode } from '../core/types';
import type { ConversationModelService } from '../models/types';
import type {
  PageReference,
  PageReferenceService,
} from '../page-context/PageReferenceService';
import type { ConversationTaskStatus } from '../runtime/RuntimeCoordinator';
import { renderModelPickerControl } from './ModelPickerControl';
import { renderPageReferenceComposer } from './PageReferenceComposer';
import type { ComposerPageReference } from './pageReferenceMentions';

export interface WindyComposerOptions {
  primaryPage: PageReference;
  text: string;
  references: ComposerPageReference[];
  selectedModel: string | undefined;
  status: ConversationTaskStatus;
  permissionMode: PermissionMode;
  models: ConversationModelService;
  referenceService: PageReferenceService;
  onDraftChange: (text: string, references: ComposerPageReference[]) => void;
  onModelSelect: (model: string | null) => Promise<void>;
  onPermissionModeSelect: (mode: PermissionMode) => Promise<void>;
  onSubmit: (text: string) => void;
  onStop: () => void;
}

export function renderWindyComposer(
  container: HTMLElement,
  options: WindyComposerOptions,
): void {
  const composer = container.createDiv('windy-view__composer');
  const isRunning = (
    options.status === 'running'
    || options.status === 'waiting-approval'
    || options.status === 'waiting-input'
  );
  const referenceComposer = renderPageReferenceComposer(composer, {
    primaryPage: options.primaryPage,
    text: options.text,
    references: options.references,
    disabled: isRunning,
    referenceService: options.referenceService,
    onChange: options.onDraftChange,
    onSubmit: options.onSubmit,
  });
  const actions = composer.createDiv('windy-view__composer-actions');
  const leftActions = actions.createDiv('windy-view__composer-actions-left');
  referenceComposer.createAddButton(leftActions);
  if (options.status !== 'idle') {
    const status = leftActions.createDiv({
      cls: `windy-view__status windy-view__status--${options.status}`,
    });
    status.createSpan('windy-view__status-dot');
    status.createSpan({ text: statusLabel(options.status) });
  }
  const rightActions = actions.createDiv('windy-view__composer-actions-right');
  renderModelPickerControl(rightActions, {
    selectedModel: options.selectedModel,
    disabled: isRunning,
    models: options.models,
    onSelect: options.onModelSelect,
  });
  renderYoloControl(rightActions, options, isRunning);
  const sendButton = rightActions.createEl('button', {
    cls: `windy-view__send-button clickable-icon${
      isRunning ? ' is-running' : ''
    }`,
    attr: {
      type: 'button',
      'aria-label': isRunning ? 'Stop response' : 'Send message',
    },
  });
  setIcon(sendButton, isRunning ? 'square' : 'arrow-up');
  setTooltip(sendButton, isRunning ? 'Stop response' : 'Send message');
  const updateSendState = (): void => {
    sendButton.disabled = !isRunning && !referenceComposer.getText().trim();
  };
  updateSendState();
  referenceComposer.input.addEventListener('input', updateSendState);
  sendButton.addEventListener('click', () => {
    if (isRunning) {
      options.onStop();
    } else {
      options.onSubmit(referenceComposer.getText());
    }
  });
}

function renderYoloControl(
  container: HTMLElement,
  options: WindyComposerOptions,
  disabled: boolean,
): void {
  let enabled = options.permissionMode === 'yolo';
  let saving = false;
  const control = container.createEl('button', {
    cls: 'windy-view__yolo-control',
    attr: {
      type: 'button',
      role: 'switch',
    },
  });
  control.createSpan({
    cls: 'windy-view__yolo-label',
    text: 'YOLO',
  });
  const track = control.createSpan('windy-view__yolo-track');
  track.createSpan('windy-view__yolo-thumb');

  const update = (): void => {
    control.toggleClass('is-active', enabled);
    control.setAttribute('aria-checked', String(enabled));
    control.setAttribute(
      'aria-label',
      enabled ? 'Disable YOLO mode' : 'Enable YOLO mode',
    );
    control.disabled = disabled || saving;
    setTooltip(
      control,
      enabled
        ? 'YOLO is on: Codex runs without approvals and has full system access'
        : 'YOLO is off: Codex asks for approval before sensitive actions',
    );
  };
  update();

  control.addEventListener('click', () => {
    if (disabled || saving) {
      return;
    }
    const nextMode: PermissionMode = enabled ? 'normal' : 'yolo';
    saving = true;
    update();
    void options.onPermissionModeSelect(nextMode).then(() => {
      enabled = nextMode === 'yolo';
      if (enabled) {
        new Notice(
          'YOLO enabled: approvals are disabled and Codex has full system access.',
        );
      }
    }).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not change permission mode: ${message}`);
    }).finally(() => {
      saving = false;
      update();
    });
  });
}

function statusLabel(status: ConversationTaskStatus): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'waiting-approval':
      return 'Needs approval';
    case 'waiting-input':
      return 'Needs input';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'interrupted':
      return 'Interrupted';
    default:
      return 'Ready';
  }
}
