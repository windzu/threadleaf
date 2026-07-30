import type { App } from 'obsidian';

import type { WindySettings } from '../types';
import type { ProviderCliResolutionContext, ProviderId } from './types';

/**
 * Minimal application capabilities consumed by Windy provider runtimes.
 */
export interface ProviderHost {
  readonly app: App;
  readonly settings: WindySettings;
  readonly manifest?: { version?: string };

  getActiveEnvironmentVariables(providerId: ProviderId): string;
  getResolvedProviderCliPath(
    providerId: ProviderId,
    context?: ProviderCliResolutionContext,
  ): Promise<string | null>;
}
