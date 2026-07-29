import type { App } from 'obsidian';

import type { ProviderHost } from '../core/providers/ProviderHost';
import type {
  ProviderCliResolutionContext,
  ProviderId,
} from '../core/providers/types';
import type { ThreadleafSettings } from '../core/types';
import { getCodexProviderSettings } from '../providers/codex/settings';

export class ThreadleafProviderHost implements ProviderHost {
  constructor(
    readonly app: App,
    readonly settings: ThreadleafSettings,
    readonly manifest: { version?: string },
  ) {}

  getActiveEnvironmentVariables(providerId: ProviderId): string {
    const shared = this.settings.sharedEnvironmentVariables.trim();
    const provider = providerId === 'codex'
      ? getCodexProviderSettings(this.settings).environmentVariables.trim()
      : '';
    return [shared, provider].filter(Boolean).join('\n');
  }

  async getResolvedProviderCliPath(
    providerId: ProviderId,
    _context?: ProviderCliResolutionContext,
  ): Promise<string | null> {
    if (providerId !== 'codex') {
      return null;
    }
    return getCodexProviderSettings(this.settings).cliPath || null;
  }
}
