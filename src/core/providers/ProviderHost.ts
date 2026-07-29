import type { App } from 'obsidian';

import type { ThreadleafSettings } from '../types';
import type { ProviderCliResolutionContext, ProviderId } from './types';

/**
 * Minimal application capabilities consumed by Threadleaf provider runtimes.
 */
export interface ProviderHost {
  readonly app: App;
  readonly settings: ThreadleafSettings;
  readonly manifest?: { version?: string };

  getActiveEnvironmentVariables(providerId: ProviderId): string;
  getResolvedProviderCliPath(
    providerId: ProviderId,
    context?: ProviderCliResolutionContext,
  ): Promise<string | null>;
}
