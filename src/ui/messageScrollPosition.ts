const STICK_TO_BOTTOM_THRESHOLD = 72;

type ScrollContainer = Pick<
  HTMLElement,
  'clientHeight' | 'scrollHeight' | 'scrollTop'
>;

export interface MessageScrollPosition {
  scrollTop: number;
  stickToBottom: boolean;
}

export function captureMessageScrollPosition(
  container: ScrollContainer | null,
): MessageScrollPosition {
  if (!container) {
    return {
      scrollTop: 0,
      stickToBottom: true,
    };
  }

  return {
    scrollTop: container.scrollTop,
    stickToBottom: (
      container.scrollHeight
      - container.scrollTop
      - container.clientHeight
      < STICK_TO_BOTTOM_THRESHOLD
    ),
  };
}

export function restoreMessageScrollPosition(
  container: ScrollContainer,
  position: MessageScrollPosition,
): void {
  container.scrollTop = position.stickToBottom
    ? container.scrollHeight
    : position.scrollTop;
}
