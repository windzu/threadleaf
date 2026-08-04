import type { WindySettings } from '../core/types';
import { DEFAULT_CODEX_PROVIDER_CONFIG } from '../providers/codex/settings';

export const CODEX_DEFAULT_MODEL_SELECTION = 'codex-default';
export const MODEL_DEFAULT_REASONING_SELECTION = 'model-default';

export const DEFAULT_WINDY_SETTINGS: WindySettings = {
  userName: '',
  permissionMode: 'normal',
  model: '',
  thinkingBudget: '',
  effortLevel: '',
  serviceTier: '',
  newConversationModel: CODEX_DEFAULT_MODEL_SELECTION,
  newConversationReasoningEffort: MODEL_DEFAULT_REASONING_SELECTION,
  enableAutoTitleGeneration: false,
  titleGenerationModel: '',
  excludedTags: [],
  mediaFolder: 'attachments',
  systemPrompt: '',
  persistentExternalContextPaths: [],
  sharedEnvironmentVariables: '',
  envSnippets: [],
  customContextLimits: {},
  customModelAliases: {},
  keyboardNavigation: {
    scrollUpKey: 'w',
    scrollDownKey: 's',
    focusInputKey: 'i',
  },
  requireCommandOrControlEnterToSend: false,
  locale: 'en',
  providerConfigs: {
    codex: {
      ...DEFAULT_CODEX_PROVIDER_CONFIG,
      enabled: true,
    },
  },
  settingsProvider: 'codex',
  savedProviderModel: {},
  savedProviderEffort: {},
  savedProviderServiceTier: {},
  savedProviderThinkingBudget: {},
  savedProviderPermissionMode: {
    codex: 'normal',
  },
  pendingProviderSessionInvalidations: {},
  enableAutoScroll: true,
  deferMathRenderingDuringStreaming: true,
  expandFileEditsByDefault: false,
  chatViewPlacement: 'right-sidebar',
  hiddenProviderCommands: {},
};

export function mergeWindySettings(
  stored: unknown,
): WindySettings {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return structuredClone(DEFAULT_WINDY_SETTINGS);
  }

  const input = stored as Partial<WindySettings>;
  return {
    ...structuredClone(DEFAULT_WINDY_SETTINGS),
    ...input,
    keyboardNavigation: {
      ...DEFAULT_WINDY_SETTINGS.keyboardNavigation,
      ...input.keyboardNavigation,
    },
    providerConfigs: {
      ...structuredClone(DEFAULT_WINDY_SETTINGS.providerConfigs),
      ...input.providerConfigs,
      codex: {
        ...DEFAULT_WINDY_SETTINGS.providerConfigs.codex,
        ...(input.providerConfigs?.codex ?? {}),
      },
    },
  };
}
