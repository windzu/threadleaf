import assert from 'node:assert/strict';
import test from 'node:test';

import {
  captureMessageScrollPosition,
  MessageScrollPositionStore,
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

test('keeps scroll positions isolated between conversations', () => {
  const store = new MessageScrollPositionStore();
  const firstConversation: TestScroller = {
    clientHeight: 400,
    scrollHeight: 1_000,
    scrollTop: 250,
  };

  const firstPosition = store.prepareForRender('conversation-a', null);
  assert.equal(firstPosition.stickToBottom, true);

  const unseenConversation = store.prepareForRender(
    'conversation-b',
    firstConversation,
  );
  assert.deepEqual(unseenConversation, {
    scrollTop: 0,
    stickToBottom: true,
  });

  const secondConversation: TestScroller = {
    clientHeight: 400,
    scrollHeight: 1_400,
    scrollTop: 900,
  };
  const restoredFirstConversation = store.prepareForRender(
    'conversation-a',
    secondConversation,
  );
  assert.deepEqual(restoredFirstConversation, {
    scrollTop: 250,
    stickToBottom: false,
  });
});

test('preserves the active conversation position across consecutive renders', () => {
  const store = new MessageScrollPositionStore();
  store.prepareForRender('conversation-a', null);

  const current: TestScroller = {
    clientHeight: 400,
    scrollHeight: 1_000,
    scrollTop: 300,
  };
  assert.deepEqual(store.prepareForRender('conversation-a', current), {
    scrollTop: 300,
    stickToBottom: false,
  });
});
