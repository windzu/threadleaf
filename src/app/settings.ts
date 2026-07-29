import type { ThreadleafSettings } from '../core/types';
import { DEFAULT_CODEX_PROVIDER_CONFIG } from '../providers/codex/settings';

const DEFAULT_CODEX_MODEL = 'gpt-5.6-sol';

export const DEFAULT_THREADLEAF_SETTINGS: ThreadleafSettings = {
  userName: '',
  permissionMode: 'normal',
  model: DEFAULT_CODEX_MODEL,
  thinkingBudget: '',
  effortLevel: 'medium',
  serviceTier: '',
  enableAutoTitleGeneration: false,
  titleGenerationModel: DEFAULT_CODEX_MODEL,
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
      customModels: DEFAULT_CODEX_MODEL,
      visibleModels: [DEFAULT_CODEX_MODEL],
    },
  },
  settingsProvider: 'codex',
  savedProviderModel: {
    codex: DEFAULT_CODEX_MODEL,
  },
  savedProviderEffort: {
    codex: 'medium',
  },
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

export function mergeThreadleafSettings(
  stored: unknown,
): ThreadleafSettings {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return structuredClone(DEFAULT_THREADLEAF_SETTINGS);
  }

  const input = stored as Partial<ThreadleafSettings>;
  return {
    ...structuredClone(DEFAULT_THREADLEAF_SETTINGS),
    ...input,
    keyboardNavigation: {
      ...DEFAULT_THREADLEAF_SETTINGS.keyboardNavigation,
      ...input.keyboardNavigation,
    },
    providerConfigs: {
      ...structuredClone(DEFAULT_THREADLEAF_SETTINGS.providerConfigs),
      ...input.providerConfigs,
      codex: {
        ...DEFAULT_THREADLEAF_SETTINGS.providerConfigs.codex,
        ...(input.providerConfigs?.codex ?? {}),
      },
    },
  };
}
