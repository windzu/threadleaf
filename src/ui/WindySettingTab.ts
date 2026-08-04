import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
} from 'obsidian';

import {
  CODEX_DEFAULT_MODEL_SELECTION,
  MODEL_DEFAULT_REASONING_SELECTION,
} from '../app/settings';
import type { WindySettings } from '../core/types';
import type {
  ConversationModelOption,
  ConversationModelService,
} from '../models/types';

export class WindySettingTab extends PluginSettingTab {
  private renderGeneration = 0;

  constructor(
    app: App,
    plugin: Plugin,
    private readonly settings: WindySettings,
    private readonly models: ConversationModelService,
    private readonly save: (settings: WindySettings) => Promise<void>,
  ) {
    super(app, plugin);
  }

  display(): void {
    const generation = ++this.renderGeneration;
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Windy' });
    containerEl.createEl('p', {
      text: 'Defaults apply only to conversations created after you change them. '
        + 'Each conversation stores the concrete model and reasoning effort it starts with.',
    });
    new Setting(containerEl)
      .setName('New conversation model')
      .setDesc('Loading the live Codex model catalog…');

    void this.models.getOptions().then(options => {
      if (generation !== this.renderGeneration) {
        return;
      }
      this.renderModelSettings(options);
    }).catch(error => {
      if (generation !== this.renderGeneration) {
        return;
      }
      containerEl.empty();
      containerEl.createEl('h2', { text: 'Windy' });
      new Setting(containerEl)
        .setName('Could not load Codex models')
        .setDesc(error instanceof Error ? error.message : String(error));
    });
  }

  private renderModelSettings(options: ConversationModelOption[]): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Windy' });
    containerEl.createEl('p', {
      text: 'Defaults apply only to new conversations. Existing conversations keep '
        + 'their stored model and reasoning effort.',
    });

    const providerDefault = options.find(option => option.isDefault)
      ?? options[0];
    const configuredModel = this.settings.newConversationModel;
    const selectedModel = configuredModel === CODEX_DEFAULT_MODEL_SELECTION
      ? providerDefault
      : options.find(option => option.value === configuredModel) ?? providerDefault;

    new Setting(containerEl)
      .setName('New conversation model')
      .setDesc(
        'Follow the current Codex default, or pin a model for future conversations.',
      )
      .addDropdown(dropdown => {
        dropdown.addOption(
          CODEX_DEFAULT_MODEL_SELECTION,
          providerDefault
            ? `Codex default (${providerDefault.label})`
            : 'Codex default',
        );
        for (const option of options) {
          dropdown.addOption(option.value, option.label);
        }
        if (
          configuredModel !== CODEX_DEFAULT_MODEL_SELECTION
          && !options.some(option => option.value === configuredModel)
        ) {
          dropdown.addOption(
            configuredModel,
            `Unavailable (${configuredModel})`,
          );
        }
        dropdown.setValue(configuredModel);
        dropdown.onChange(value => {
          void this.updateModel(value, options);
        });
      });

    const configuredEffort = this.settings.newConversationReasoningEffort;
    new Setting(containerEl)
      .setName('New conversation reasoning')
      .setDesc(
        'Follow the selected model default, or pin an effort for future conversations.',
      )
      .addDropdown(dropdown => {
        const defaultEffort = selectedModel?.defaultReasoningEffort;
        dropdown.addOption(
          MODEL_DEFAULT_REASONING_SELECTION,
          defaultEffort
            ? `Model default (${this.formatEffort(defaultEffort)})`
            : 'Model default',
        );
        for (const effort of selectedModel?.reasoningEfforts ?? []) {
          dropdown.addOption(effort.value, effort.label);
        }
        if (
          configuredEffort !== MODEL_DEFAULT_REASONING_SELECTION
          && !selectedModel?.reasoningEfforts.some(
            effort => effort.value === configuredEffort,
          )
        ) {
          dropdown.addOption(
            configuredEffort,
            `Unavailable (${configuredEffort})`,
          );
        }
        dropdown.setValue(configuredEffort);
        dropdown.onChange(value => {
          void this.updateReasoningEffort(value);
        });
      });

    if (selectedModel) {
      const effectiveEffort = configuredEffort === MODEL_DEFAULT_REASONING_SELECTION
        || !selectedModel.reasoningEfforts.some(
          effort => effort.value === configuredEffort,
        )
        ? selectedModel.defaultReasoningEffort
        : configuredEffort;
      new Setting(containerEl)
        .setName('Resolved next conversation')
        .setDesc(
          `${selectedModel.label} · ${this.formatEffort(effectiveEffort)}. `
            + 'This concrete pair will be stored when a new conversation starts.',
        );
    }
  }

  private async updateModel(
    value: string,
    options: ConversationModelOption[],
  ): Promise<void> {
    this.settings.newConversationModel = value;
    const model = value === CODEX_DEFAULT_MODEL_SELECTION
      ? options.find(option => option.isDefault) ?? options[0]
      : options.find(option => option.value === value);
    if (
      this.settings.newConversationReasoningEffort
        !== MODEL_DEFAULT_REASONING_SELECTION
      && !model?.reasoningEfforts.some(
        effort => effort.value === this.settings.newConversationReasoningEffort,
      )
    ) {
      this.settings.newConversationReasoningEffort
        = MODEL_DEFAULT_REASONING_SELECTION;
    }
    await this.persistAndRender();
  }

  private async updateReasoningEffort(value: string): Promise<void> {
    this.settings.newConversationReasoningEffort = value;
    await this.persistAndRender();
  }

  private async persistAndRender(): Promise<void> {
    try {
      await this.save(this.settings);
      this.display();
    } catch (error) {
      new Notice(`Could not save Windy settings: ${
        error instanceof Error ? error.message : String(error)
      }`);
    }
  }

  private formatEffort(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
