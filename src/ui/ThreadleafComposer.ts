import type { ConversationModelService } from '../models/types';
import type {
  PageReference,
  PageReferenceService,
} from '../page-context/PageReferenceService';
import type { ConversationTaskStatus } from '../runtime/RuntimeCoordinator';
import { renderModelPickerControl } from './ModelPickerControl';
import { renderPageReferenceComposer } from './PageReferenceComposer';

export interface ThreadleafComposerOptions {
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

export function renderThreadleafComposer(
  container: HTMLElement,
  options: ThreadleafComposerOptions,
): void {
  const composer = container.createDiv('threadleaf-view__composer');
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
  const actions = composer.createDiv('threadleaf-view__composer-actions');
  referenceComposer.createAddButton(actions);
  actions.createDiv({
    cls: `threadleaf-view__status threadleaf-view__status--${options.status}`,
    text: statusLabel(options.status),
  });
  renderModelPickerControl(actions, {
    selectedModel: options.selectedModel,
    disabled: isRunning,
    models: options.models,
    onSelect: options.onModelSelect,
  });
  const sendButton = actions.createEl('button', {
    cls: 'mod-cta',
    text: isRunning ? 'Stop' : 'Send',
  });
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
