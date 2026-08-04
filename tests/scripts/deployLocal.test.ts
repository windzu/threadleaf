import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { describe } from 'node:test';

import {
  createLocalDeployPlugin,
  resolveLocalVaultPath,
} from '../../scripts/local-deployment.mjs';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const deployScript = path.join(projectRoot, 'scripts', 'deploy-local.mjs');

test('local deployment copies release assets without modifying their contents', () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'windy-deploy-test-'));
  const buildDirectory = path.join(fixtureRoot, 'build');
  const vaultDirectory = path.join(fixtureRoot, 'vault');
  mkdirSync(buildDirectory);
  mkdirSync(vaultDirectory);

  const assets = {
    'main.js': 'console.log("windy");\n',
    'manifest.json': '{"id":"windy"}\n',
    'styles.css': '.windy-floating-button svg { display: block; }\n',
  };

  try {
    for (const [filename, contents] of Object.entries(assets)) {
      writeFileSync(path.join(buildDirectory, filename), contents);
    }

    const deployment = spawnSync(process.execPath, [deployScript, vaultDirectory], {
      cwd: buildDirectory,
      encoding: 'utf8',
    });

    assert.equal(deployment.status, 0, deployment.stderr);

    const pluginDirectory = path.join(
      vaultDirectory,
      '.obsidian',
      'plugins',
      'windy',
    );
    for (const [filename, contents] of Object.entries(assets)) {
      assert.equal(readFileSync(path.join(pluginDirectory, filename), 'utf8'), contents);
    }
    assert.equal(readFileSync(path.join(pluginDirectory, '.hotreload'), 'utf8'), '');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('local deployment reads WINDY_VAULT from .env.local', () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'windy-deploy-env-test-'));
  const vaultDirectory = path.join(fixtureRoot, 'vault');
  mkdirSync(vaultDirectory);
  try {
    for (const [filename, contents] of Object.entries({
      'main.js': 'main',
      'manifest.json': 'manifest',
      'styles.css': 'styles',
    })) {
      writeFileSync(path.join(fixtureRoot, filename), contents);
    }
    writeFileSync(
      path.join(fixtureRoot, '.env.local'),
      `WINDY_VAULT=${vaultDirectory}\n`,
    );

    const environment = { ...process.env };
    delete environment.WINDY_VAULT;
    const deployment = spawnSync(process.execPath, [deployScript], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env: environment,
    });

    assert.equal(deployment.status, 0, deployment.stderr);
    assert.equal(
      readFileSync(path.join(
        vaultDirectory,
        '.obsidian',
        'plugins',
        'windy',
        'main.js',
      ), 'utf8'),
      'main',
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

describe('automatic local deployment', () => {
  test('uses an explicit path before the environment value', () => {
    assert.equal(
      resolveLocalVaultPath('/explicit', { WINDY_VAULT: '/environment' }),
      path.resolve('/explicit'),
    );
  });

  test('deploys only after successful builds', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'windy-deploy-watch-test-'));
    const vaultDirectory = path.join(fixtureRoot, 'vault');
    let onEnd: ((result: { errors: unknown[] }) => void) | null = null;
    try {
      mkdirSync(vaultDirectory);
      for (const filename of ['main.js', 'manifest.json', 'styles.css']) {
        writeFileSync(path.join(fixtureRoot, filename), filename);
      }
      createLocalDeployPlugin(vaultDirectory, fixtureRoot).setup({
        onEnd(callback: (result: { errors: unknown[] }) => void) {
          onEnd = callback;
        },
      });

      onEnd!({ errors: [{}] });
      const pluginMain = path.join(
        vaultDirectory,
        '.obsidian',
        'plugins',
        'windy',
        'main.js',
      );
      assert.throws(() => readFileSync(pluginMain));

      onEnd!({ errors: [] });
      assert.equal(readFileSync(pluginMain, 'utf8'), 'main.js');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
