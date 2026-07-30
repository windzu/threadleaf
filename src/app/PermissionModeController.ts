import type { PermissionMode, WindySettings } from '../core/types';

export type PersistWindySettings = (settings: WindySettings) => Promise<void>;

/**
 * Keeps the composer permission control and the settings object read by Codex
 * on the same source of truth.
 */
export class PermissionModeController {
  constructor(
    private readonly settings: WindySettings,
    private readonly persist: PersistWindySettings,
  ) {}

  getMode(): PermissionMode {
    return this.settings.permissionMode;
  }

  async setMode(mode: PermissionMode): Promise<void> {
    const previousMode = this.settings.permissionMode;
    const previousSavedMode = this.settings.savedProviderPermissionMode.codex;
    if (previousMode === mode && previousSavedMode === mode) {
      return;
    }

    this.settings.permissionMode = mode;
    this.settings.savedProviderPermissionMode.codex = mode;
    try {
      await this.persist(this.settings);
    } catch (error) {
      this.settings.permissionMode = previousMode;
      if (previousSavedMode === undefined) {
        delete this.settings.savedProviderPermissionMode.codex;
      } else {
        this.settings.savedProviderPermissionMode.codex = previousSavedMode;
      }
      throw error;
    }
  }
}
