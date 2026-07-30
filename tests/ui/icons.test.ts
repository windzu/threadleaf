import assert from 'node:assert/strict';
import test from 'node:test';

import { WINDY_ICON_SVG, WINDY_NAV_ICON } from '../../src/ui/icons';

test('defines a theme-compatible Wind mark in the Obsidian icon coordinate space', () => {
  assert.equal(WINDY_NAV_ICON, 'windy-mark');
  assert.match(WINDY_ICON_SVG, /currentColor/);
  assert.match(WINDY_ICON_SVG, /scale\(4\.1666667\)/);
  assert.doesNotMatch(WINDY_ICON_SVG, /#[0-9a-f]{3,8}/i);
});
