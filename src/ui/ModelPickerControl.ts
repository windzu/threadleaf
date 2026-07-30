import { Menu, Notice, setIcon } from 'obsidian';

import type { ConversationModelService } from '../models/types';

export interface ModelPickerControlOptions {
  selectedModel: string | undefined;
  disabled: boolean;
  models: ConversationModelService;
  onSelect: (model: string | null) => Promise<void>;
}

export function renderModelPickerControl(
  container: HTMLElement,
  options: ModelPickerControlOptions,
): void {
  const trigger = container.createEl('button', {
    cls: 'windy-view__model-trigger clickable-icon',
    attr: {
      type: 'button',
      'aria-label': 'Choose model',
    },
  });
  const icon = trigger.createSpan('windy-view__model-icon');
  setIcon(icon, 'sparkles');
  const label = trigger.createSpan({
    cls: 'windy-view__model-label',
    text: options.models.getSelectionLabel(options.selectedModel),
  });
  trigger.disabled = options.disabled;
  trigger.addEventListener('click', event => {
    trigger.addClass('is-loading');
    label.setText('Loading…');
    void options.models.getOptions().then(models => {
      trigger.removeClass('is-loading');
      label.setText(options.models.getSelectionLabel(
        options.selectedModel,
        models,
      ));
      const menu = new Menu();
      menu.addItem(item => {
        item
          .setTitle('Auto')
          .setIcon('wand-sparkles')
          .setChecked(!options.selectedModel)
          .onClick(() => runSelection(options, null));
      });
      menu.addItem(item => {
        item
          .setTitle(options.models.getAutoDescription())
          .setDisabled(true);
      });
      menu.addSeparator();
      menu.addItem(item => {
        item.setTitle('Choose model').setDisabled(true);
      });
      for (const model of models) {
        menu.addItem(item => {
          item
            .setTitle(model.label)
            .setIcon('bot')
            .setChecked(options.selectedModel === model.value)
            .onClick(() => runSelection(options, model.value));
        });
      }
      menu.showAtMouseEvent(event);
    }).catch(error => {
      trigger.removeClass('is-loading');
      label.setText(options.models.getSelectionLabel(options.selectedModel));
      new Notice(error instanceof Error ? error.message : String(error));
    });
  });
}

function runSelection(
  options: ModelPickerControlOptions,
  model: string | null,
): void {
  void options.onSelect(model).catch(error => {
    new Notice(error instanceof Error ? error.message : String(error));
  });
}
