import assert from 'node:assert/strict';
import test from 'node:test';

import { PermissionModeController } from '../../src/app/PermissionModeController';
import { DEFAULT_WINDY_SETTINGS } from '../../src/app/settings';

test('persists YOLO as the active and Codex provider permission mode', async () => {
  const settings = structuredClone(DEFAULT_WINDY_SETTINGS);
  let persisted = false;
  const controller = new PermissionModeController(settings, async value => {
    persisted = true;
    assert.equal(value.permissionMode, 'yolo');
    assert.equal(value.savedProviderPermissionMode.codex, 'yolo');
  });

  await controller.setMode('yolo');

  assert.equal(controller.getMode(), 'yolo');
  assert.equal(persisted, true);
});

test('rolls back the in-memory mode when persistence fails', async () => {
  const settings = structuredClone(DEFAULT_WINDY_SETTINGS);
  const controller = new PermissionModeController(settings, async () => {
    throw new Error('disk unavailable');
  });

  await assert.rejects(controller.setMode('yolo'), /disk unavailable/);

  assert.equal(controller.getMode(), 'normal');
  assert.equal(settings.savedProviderPermissionMode.codex, 'normal');
});
