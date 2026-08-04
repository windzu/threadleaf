import { Menu, Notice, setIcon } from 'obsidian';

import type { ConversationModelService } from '../models/types';

export interface ReasoningEffortPickerControlOptions {
  selectedModel: string | undefined;
  selectedReasoningEffort: string | undefined;
  disabled: boolean;
  models: ConversationModelService;
  onSelect: (reasoningEffort: string | null) => Promise<void>;
}

export function renderReasoningEffortPickerControl(
  container: HTMLElement,
  options: ReasoningEffortPickerControlOptions,
): void {
  const trigger = container.createEl('button', {
    cls: 'windy-view__effort-trigger clickable-icon',
    attr: {
      type: 'button',
      'aria-label': 'Choose reasoning effort',
    },
  });
  const icon = trigger.createSpan('windy-view__effort-icon');
  setIcon(icon, 'gauge');
  const label = trigger.createSpan({
    cls: 'windy-view__effort-label',
    text: options.models.getReasoningSelectionLabel(
      options.selectedModel,
      options.selectedReasoningEffort,
    ),
  });
  trigger.disabled = options.disabled;
  trigger.addEventListener('click', event => {
    trigger.addClass('is-loading');
    label.setText('Loading…');
    void Promise.all([
      options.models.getOptions(),
      options.models.getReasoningOptions(options.selectedModel),
    ]).then(([models, efforts]) => {
      trigger.removeClass('is-loading');
      label.setText(options.models.getReasoningSelectionLabel(
        options.selectedModel,
        options.selectedReasoningEffort,
        models,
      ));
      const menu = new Menu();
      menu.addItem(item => {
        item.setTitle('Reasoning effort').setDisabled(true);
      });
      for (const effort of efforts) {
        menu.addItem(item => {
          item
            .setTitle(effort.label)
            .setIcon('gauge')
            .setChecked(options.selectedReasoningEffort === effort.value)
            .onClick(() => runSelection(options, effort.value));
        });
      }
      menu.showAtMouseEvent(event);
    }).catch(error => {
      trigger.removeClass('is-loading');
      label.setText(options.models.getReasoningSelectionLabel(
        options.selectedModel,
        options.selectedReasoningEffort,
      ));
      new Notice(error instanceof Error ? error.message : String(error));
    });
  });
}

function runSelection(
  options: ReasoningEffortPickerControlOptions,
  reasoningEffort: string | null,
): void {
  void options.onSelect(reasoningEffort).catch(error => {
    new Notice(error instanceof Error ? error.message : String(error));
  });
}
