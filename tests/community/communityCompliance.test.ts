import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('preserves custom workspace leaves when the plugin unloads', async () => {
  const source = await readFile(
    new URL('../../src/main.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /detachLeavesOfType/);
});

test('does not repeat the plugin name in settings headings', async () => {
  const source = await readFile(
    new URL('../../src/ui/WindySettingTab.ts', import.meta.url),
    'utf8',
  );
  const headings = [...source.matchAll(/setName\('([^']+)'\)\.setHeading\(\)/g)]
    .map(match => match[1]);

  assert.ok(headings.length > 0);
  assert.ok(headings.every(heading => heading !== 'Windy'));
});
