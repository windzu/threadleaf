import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatToolName,
  formatToolPayload,
  toolStatusIcon,
  toolStatusLabel,
} from '../../src/ui/messageFormatting';

test('formats provider tool names for display', () => {
  assert.equal(formatToolName('command_execution'), 'Command execution');
  assert.equal(formatToolName('readFile'), 'Read file');
  assert.equal(formatToolName('web-search'), 'Web search');
  assert.equal(formatToolName(''), 'Tool');
});

test('maps tool statuses to readable labels and Obsidian icons', () => {
  assert.equal(toolStatusLabel('running'), 'Running');
  assert.equal(toolStatusLabel('completed'), 'Completed');
  assert.equal(toolStatusLabel('error'), 'Failed');
  assert.equal(toolStatusLabel('blocked'), 'Blocked');

  assert.equal(toolStatusIcon('running'), 'loader-circle');
  assert.equal(toolStatusIcon('completed'), 'circle-check');
  assert.equal(toolStatusIcon('error'), 'circle-alert');
  assert.equal(toolStatusIcon('blocked'), 'ban');
});

test('formats structured tool payloads and bounds long output', () => {
  assert.equal(
    formatToolPayload({ command: 'echo ok' }),
    '{\n  "command": "echo ok"\n}',
  );
  assert.equal(
    formatToolPayload('123456', 4),
    '1234\n… output truncated',
  );
  assert.equal(formatToolPayload(undefined), 'undefined');
});
