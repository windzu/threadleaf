const STICK_TO_BOTTOM_THRESHOLD = 72;

type ScrollContainer = Pick<
  HTMLElement,
  'clientHeight' | 'scrollHeight' | 'scrollTop'
>;

export interface MessageScrollPosition {
  scrollTop: number;
  stickToBottom: boolean;
}

const DEFAULT_SCROLL_POSITION: MessageScrollPosition = {
  scrollTop: 0,
  stickToBottom: true,
};

export class MessageScrollPositionStore {
  private activeKey: string | null = null;
  private readonly positions = new Map<string, MessageScrollPosition>();

  prepareForRender(
    nextKey: string | null,
    currentContainer: ScrollContainer | null,
  ): MessageScrollPosition {
    if (this.activeKey && currentContainer) {
      this.positions.set(
        this.activeKey,
        captureMessageScrollPosition(currentContainer),
      );
    }
    this.activeKey = nextKey;
    return nextKey
      ? this.positions.get(nextKey) ?? { ...DEFAULT_SCROLL_POSITION }
      : { ...DEFAULT_SCROLL_POSITION };
  }
}

export function captureMessageScrollPosition(
  container: ScrollContainer | null,
): MessageScrollPosition {
  if (!container) {
    return { ...DEFAULT_SCROLL_POSITION };
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
