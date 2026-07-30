import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

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
