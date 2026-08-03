export interface ConversationReasoningEffortOption {
  value: string;
  label: string;
  description: string;
  isDefault: boolean;
}

export interface ConversationModelOption {
  value: string;
  label: string;
  description: string;
  isDefault: boolean;
  reasoningEfforts: ConversationReasoningEffortOption[];
  defaultReasoningEffort: string;
}

export interface ConversationModelService {
  getOptions(): Promise<ConversationModelOption[]>;
  getSelectionLabel(
    selectedModel: string | undefined,
    options?: ConversationModelOption[],
  ): string;
  getAutoDescription(): string;
  getReasoningOptions(
    selectedModel: string | undefined,
  ): Promise<ConversationReasoningEffortOption[]>;
  getReasoningSelectionLabel(
    selectedModel: string | undefined,
    selectedReasoningEffort: string | undefined,
    options?: ConversationModelOption[],
  ): string;
  getReasoningAutoDescription(
    selectedModel: string | undefined,
    options?: ConversationModelOption[],
  ): string;
  select(conversationId: string, model: string | null): Promise<void>;
  selectReasoningEffort(
    conversationId: string,
    selectedModel: string | undefined,
    reasoningEffort: string | null,
  ): Promise<void>;
}
