import type { WindySettings } from '../../core/types';
import type {
  ConversationModelOption,
  ConversationModelService,
} from '../../models/types';
import { formatCodexModelLabel } from './types/models';
import type {
  AppServerModel,
  ModelListResult,
} from './runtime/codexAppServerTypes';

export interface ModelCatalogGateway {
  ensureReady(): Promise<unknown>;
  request<T>(method: string, params: unknown, timeoutMs?: number): Promise<T>;
}

export interface ConversationModelTarget {
  setModel(conversationId: string, model: string | undefined): Promise<void>;
}

export class CodexConversationModelService implements ConversationModelService {
  private options: ConversationModelOption[] | null = null;
  private refreshFlight: Promise<ConversationModelOption[]> | null = null;

  constructor(
    private readonly gateway: ModelCatalogGateway,
    private readonly target: ConversationModelTarget,
    private readonly settings: WindySettings,
  ) {}

  async getOptions(): Promise<ConversationModelOption[]> {
    if (this.options) {
      return structuredClone(this.options);
    }
    if (!this.refreshFlight) {
      this.refreshFlight = this.loadOptions();
    }
    try {
      return structuredClone(await this.refreshFlight);
    } finally {
      this.refreshFlight = null;
    }
  }

  getSelectionLabel(
    selectedModel: string | undefined,
    options: ConversationModelOption[] = this.options ?? [],
  ): string {
    if (!selectedModel) {
      return 'Auto';
    }
    return options.find(option => option.value === selectedModel)?.label
      ?? formatCodexModelLabel(selectedModel);
  }

  getAutoDescription(): string {
    return `Uses the Windy default (${formatCodexModelLabel(this.settings.model)}).`;
  }

  async select(
    conversationId: string,
    model: string | null,
  ): Promise<void> {
    if (model !== null) {
      const options = await this.getOptions();
      if (!options.some(option => option.value === model)) {
        throw new Error(`Model "${model}" is not available.`);
      }
    }
    await this.target.setModel(conversationId, model ?? undefined);
  }

  private async loadOptions(): Promise<ConversationModelOption[]> {
    await this.gateway.ensureReady();
    const models: AppServerModel[] = [];
    let cursor: string | null | undefined;
    do {
      const result = await this.gateway.request<ModelListResult>(
        'model/list',
        {
          limit: 100,
          ...(cursor ? { cursor } : {}),
        },
      );
      models.push(...result.data);
      cursor = result.nextCursor;
    } while (cursor);

    this.options = models
      .filter(model => !model.hidden)
      .map(model => ({
        value: model.model || model.id,
        label: formatCodexModelLabel(model.model || model.id),
        description: model.description,
        isDefault: model.isDefault,
      }));
    return this.options;
  }
}
