import { setIcon, setTooltip } from 'obsidian';

import type { ConversationModelService } from '../models/types';
import type {
  PageReference,
  PageReferenceService,
} from '../page-context/PageReferenceService';
import type { ConversationTaskStatus } from '../runtime/RuntimeCoordinator';
import { renderModelPickerControl } from './ModelPickerControl';
import { renderPageReferenceComposer } from './PageReferenceComposer';

export interface WindyComposerOptions {
  primaryPage: PageReference;
  text: string;
  references: PageReference[];
  selectedModel: string | undefined;
  status: ConversationTaskStatus;
  models: ConversationModelService;
  referenceService: PageReferenceService;
  onDraftChange: (text: string, references: PageReference[]) => void;
  onModelSelect: (model: string | null) => Promise<void>;
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
    sendButton.disabled = !isRunning && !referenceComposer.input.value.trim();
  };
  updateSendState();
  referenceComposer.input.addEventListener('input', updateSendState);
  sendButton.addEventListener('click', () => {
    if (isRunning) {
      options.onStop();
    } else {
      options.onSubmit(referenceComposer.input.value);
    }
  });
}

function statusLabel(status: ConversationTaskStatus): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'waiting-approval':
      return 'Needs approval';
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
