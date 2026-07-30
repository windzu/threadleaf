import {
  Menu,
  Notice,
  setIcon,
  setTooltip,
  type MenuItem,
} from 'obsidian';

import type { ConversationMeta } from '../core/types';

export interface ConversationHistoryControlOptions {
  history: ConversationMeta[];
  activeConversationId: string | null;
  isDraft: boolean;
  onStartDraft: () => void;
  onSelect: (conversationId: string) => Promise<void>;
}

export function renderConversationHistoryControl(
  container: HTMLElement,
  options: ConversationHistoryControlOptions,
): void {
  const active = options.history.find(
    item => item.id === options.activeConversationId,
  );
  const conversationBar = container.createDiv(
    'windy-view__conversation-bar',
  );
  const trigger = conversationBar.createEl('button', {
    cls: 'windy-view__conversation-trigger',
  });
  trigger.createSpan({
    cls: 'windy-view__conversation-title',
    text: options.isDraft
      ? 'New conversation'
      : active?.title ?? 'Current conversation',
  });
  const chevron = trigger.createSpan({
    cls: 'windy-view__conversation-chevron',
  });
  setIcon(chevron, 'chevron-down');
  trigger.setAttribute(
    'aria-label',
    `Choose conversation. ${options.history.length} saved for this page.`,
  );
  trigger.addEventListener('click', event => {
    const menu = new Menu();
    menu.addItem(item => {
      item
        .setTitle('New conversation')
        .setIcon('plus')
        .setChecked(options.isDraft)
        .onClick(options.onStartDraft);
    });
    menu.addSeparator();
    for (const conversation of options.history) {
      menu.addItem(item => configureConversationItem(
        item,
        conversation,
        conversation.id === options.activeConversationId && !options.isDraft,
        () => {
          void options.onSelect(conversation.id).catch(error => {
            new Notice(error instanceof Error ? error.message : String(error));
          });
        },
      ));
    }
    menu.showAtMouseEvent(event);
  });
  const newConversation = conversationBar.createEl('button', {
    cls: 'windy-view__new-conversation clickable-icon',
    attr: {
      type: 'button',
      'aria-label': 'Start a new conversation',
    },
  });
  setIcon(newConversation, 'message-circle-plus');
  setTooltip(newConversation, 'New conversation');
  newConversation.addEventListener('click', options.onStartDraft);
}

function configureConversationItem(
  item: MenuItem,
  conversation: ConversationMeta,
  checked: boolean,
  onClick: () => void,
): void {
  item
    .setTitle(conversation.title)
    .setIcon(conversation.messageCount > 0 ? 'message-square' : 'message-circle')
    .setChecked(checked)
    .onClick(onClick);
}
