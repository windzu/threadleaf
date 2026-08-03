import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('allows rendered message text to be selected in an Obsidian item view', () => {
  const styles = readFileSync(
    new URL('../../styles.css', import.meta.url),
    'utf8',
  );
  const messageContentRule = styles.match(
    /\.windy-message__content\s*\{(?<declarations>[^}]*)\}/,
  );

  assert.match(
    messageContentRule?.groups?.declarations ?? '',
    /user-select:\s*text/,
  );
  assert.match(
    messageContentRule?.groups?.declarations ?? '',
    /-webkit-user-select:\s*text/,
  );
});
