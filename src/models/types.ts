export interface ConversationModelOption {
  value: string;
  label: string;
  description: string;
  isDefault: boolean;
}

export interface ConversationModelService {
  getOptions(): Promise<ConversationModelOption[]>;
  getSelectionLabel(
    selectedModel: string | undefined,
    options?: ConversationModelOption[],
  ): string;
  getAutoDescription(): string;
  select(conversationId: string, model: string | null): Promise<void>;
}
