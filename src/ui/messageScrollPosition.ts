const STICK_TO_BOTTOM_THRESHOLD = 72;
const AT_BOTTOM_THRESHOLD = 1;

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
  private activeContainer: ScrollContainer | null = null;
  private expectedProgrammaticScrollTop: number | null = null;
  private readonly positions = new Map<string, MessageScrollPosition>();

  prepareForRender(
    nextKey: string | null,
    currentContainer: ScrollContainer | null,
  ): MessageScrollPosition {
    if (this.activeKey && currentContainer) {
      const captured = captureMessageScrollPosition(currentContainer);
      // Manual scrolling remains authoritative until the user reaches the bottom.
      if (this.positions.get(this.activeKey)?.stickToBottom === false) {
        captured.stickToBottom = (
          distanceFromBottom(currentContainer) <= AT_BOTTOM_THRESHOLD
        );
      }
      this.positions.set(
        this.activeKey,
        captured,
      );
    }
    this.activeKey = nextKey;
    this.activeContainer = null;
    this.expectedProgrammaticScrollTop = null;
    const position = nextKey
      ? this.positions.get(nextKey) ?? { ...DEFAULT_SCROLL_POSITION }
      : { ...DEFAULT_SCROLL_POSITION };
    if (nextKey) {
      this.positions.set(nextKey, position);
    }
    return { ...position };
  }

  trackActiveContainer(
    key: string | null,
    container: ScrollContainer,
  ): void {
    if (key === this.activeKey) {
      this.activeContainer = container;
      this.expectedProgrammaticScrollTop = null;
    }
  }

  restoreActivePosition(
    key: string | null,
    container: ScrollContainer,
    position: MessageScrollPosition,
  ): void {
    restoreMessageScrollPosition(container, position);
    if (key === this.activeKey && container === this.activeContainer) {
      this.expectedProgrammaticScrollTop = container.scrollTop;
    }
  }

  recordActiveScroll(
    key: string | null,
    container: ScrollContainer,
  ): void {
    if (
      !key
      || key !== this.activeKey
      || container !== this.activeContainer
    ) {
      return;
    }
    if (
      this.expectedProgrammaticScrollTop !== null
      && Math.abs(
        container.scrollTop - this.expectedProgrammaticScrollTop,
      ) <= AT_BOTTOM_THRESHOLD
    ) {
      this.expectedProgrammaticScrollTop = null;
      return;
    }
    this.expectedProgrammaticScrollTop = null;
    this.positions.set(key, {
      scrollTop: container.scrollTop,
      stickToBottom: distanceFromBottom(container) <= AT_BOTTOM_THRESHOLD,
    });
  }

  getPosition(key: string | null): MessageScrollPosition {
    if (!key || key !== this.activeKey) {
      return { ...DEFAULT_SCROLL_POSITION };
    }
    return {
      ...(this.positions.get(key) ?? DEFAULT_SCROLL_POSITION),
    };
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
    stickToBottom: distanceFromBottom(container) < STICK_TO_BOTTOM_THRESHOLD,
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

function distanceFromBottom(container: ScrollContainer): number {
  return container.scrollHeight
    - container.scrollTop
    - container.clientHeight;
}
