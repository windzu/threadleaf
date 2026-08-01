import assert from 'node:assert/strict';
import test from 'node:test';

import {
  captureMessageScrollPosition,
  restoreMessageScrollPosition,
} from '../../src/ui/messageScrollPosition';

interface TestScroller {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

test('keeps consecutive message renders pinned to the bottom', () => {
  const previous: TestScroller = {
    clientHeight: 400,
    scrollHeight: 1_000,
    scrollTop: 600,
  };
  const position = captureMessageScrollPosition(previous);
  const replacement: TestScroller = {
    clientHeight: 400,
    scrollHeight: 1_200,
    scrollTop: 0,
  };

  restoreMessageScrollPosition(replacement, position);

  assert.equal(replacement.scrollTop, 1_200);
  assert.equal(
    captureMessageScrollPosition(replacement).stickToBottom,
    true,
  );
});

test('preserves the position when the user has scrolled away from the bottom', () => {
  const previous: TestScroller = {
    clientHeight: 400,
    scrollHeight: 1_000,
    scrollTop: 250,
  };
  const position = captureMessageScrollPosition(previous);
  const replacement: TestScroller = {
    clientHeight: 400,
    scrollHeight: 1_200,
    scrollTop: 0,
  };

  restoreMessageScrollPosition(replacement, position);

  assert.equal(replacement.scrollTop, 250);
  assert.equal(position.stickToBottom, false);
});
