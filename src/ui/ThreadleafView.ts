import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';

import type { ConversationRepository } from '../conversations/ConversationRepository';
import type {
  PageConversationRoute,
  PageConversationRouter,
} from '../page-context/PageConversationRouter';
import type {
  ConversationRuntimeSnapshot,
  RuntimeCoordinator,
} from '../runtime/RuntimeCoordinator';

export const VIEW_TYPE_THREADLEAF = 'threadleaf-agent-view';

export class ThreadleafView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly router: PageConversationRouter,
    private readonly conversations: ConversationRepository,
    private readonly runtimeCoordinator: RuntimeCoordinator,
    private readonly defaultModel: string,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_THREADLEAF;
  }

  getDisplayText(): string {
    return 'Threadleaf';
  }

  getIcon(): string {
    return 'logo-crystal';
  }

  async onOpen(): Promise<void> {
    void this.renderRoute(this.router.getRoute());
    this.register(this.router.onChange(route => {
      void this.renderRoute(route);
    }));
    this.register(this.runtimeCoordinator.onChange((conversationId, snapshot) => {
      if (conversationId === this.router.getRoute().activeConversationId) {
        this.renderConversation(this.router.getRoute(), snapshot);
      }
    }));
  }

  private async renderRoute(route: PageConversationRoute): Promise<void> {
    const conversationId = route.activeConversationId;
    if (!conversationId) {
      this.renderConversation(route, null);
      return;
    }
    const snapshot = await this.runtimeCoordinator.getSnapshot(conversationId);
    if (this.router.getRoute().activeConversationId === conversationId) {
      this.renderConversation(route, snapshot);
    }
  }

  private renderConversation(
    route: PageConversationRoute,
    snapshot: ConversationRuntimeSnapshot | null,
  ): void {
    const page = route.page;
    this.contentEl.empty();
    this.contentEl.addClass('threadleaf-view');

    const header = this.contentEl.createDiv('threadleaf-view__header');
    header.createEl('div', {
      cls: 'threadleaf-view__eyebrow',
      text: 'PAGE AGENT',
    });
    header.createEl('h2', {
      text: page?.basename ?? 'No active page',
    });
    header.createEl('p', {
      cls: 'threadleaf-view__context',
      text: page
        ? `Context: ${page.path}`
        : 'Open a Markdown or Bases page to start a page-native conversation.',
    });

    if (!page) {
      return;
    }

    const conversationBar = this.contentEl.createDiv('threadleaf-view__conversation-bar');
    if (route.conversationIds.length > 0) {
      const selector = conversationBar.createEl('select', {
        cls: 'dropdown threadleaf-view__conversation-select',
      });
      for (const conversationId of route.conversationIds) {
        selector.createEl('option', {
          value: conversationId,
          text: conversationId === route.activeConversationId
            ? snapshot?.conversation?.title ?? 'Current conversation'
            : `Conversation ${conversationId.slice(0, 8)}`,
        });
      }
      selector.value = route.activeConversationId ?? '';
      selector.addEventListener('change', () => {
        void this.router.selectConversation(selector.value);
      });
    }

    const newButton = conversationBar.createEl('button', {
      cls: 'threadleaf-view__new-conversation',
      text: 'New',
    });
    newButton.addEventListener('click', () => {
      void this.createConversation();
    });

    if (!snapshot?.conversation) {
      const emptyState = this.contentEl.createDiv('threadleaf-view__empty');
      emptyState.createEl('p', {
        text: 'Start a conversation for this page.',
      });
      const startButton = emptyState.createEl('button', {
        cls: 'mod-cta',
        text: 'New conversation',
      });
      startButton.addEventListener('click', () => {
        void this.createConversation();
      });
      return;
    }

    const messages = this.contentEl.createDiv('threadleaf-view__messages');
    for (const message of snapshot.conversation.messages) {
      const messageElement = messages.createDiv({
        cls: `threadleaf-message threadleaf-message--${message.role}`,
      });
      messageElement.createDiv({
        cls: 'threadleaf-message__role',
        text: message.role === 'user' ? 'You' : 'Threadleaf',
      });
      messageElement.createDiv({
        cls: 'threadleaf-message__content',
        text: message.content || (message.role === 'assistant' ? '…' : ''),
      });
      if (message.toolCalls?.length) {
        const tools = messageElement.createDiv('threadleaf-message__tools');
        for (const toolCall of message.toolCalls) {
          tools.createDiv({
            cls: `threadleaf-tool threadleaf-tool--${toolCall.status}`,
            text: `${toolCall.name} · ${toolCall.status}`,
          });
        }
      }
    }

    if (snapshot.pendingApproval) {
      this.renderApproval(snapshot);
    }

    if (snapshot.error) {
      this.contentEl.createDiv({
        cls: 'threadleaf-view__error',
        text: snapshot.error,
      });
    }

    const composer = this.contentEl.createDiv('threadleaf-view__composer');
    const input = composer.createEl('textarea', {
      cls: 'threadleaf-view__input',
      attr: {
        placeholder: `Ask about ${page.basename}…`,
        rows: '3',
      },
    });
    const actions = composer.createDiv('threadleaf-view__composer-actions');
    actions.createDiv({
      cls: `threadleaf-view__status threadleaf-view__status--${snapshot.status}`,
      text: this.statusLabel(snapshot.status),
    });
    const isRunning = snapshot.status === 'running'
      || snapshot.status === 'waiting-approval';
    const sendButton = actions.createEl('button', {
      cls: 'mod-cta',
      text: isRunning ? 'Stop' : 'Send',
    });
    sendButton.addEventListener('click', () => {
      if (isRunning) {
        this.runtimeCoordinator.cancel(snapshot.conversation!.id);
        return;
      }
      void this.send(input.value);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !isRunning) {
        event.preventDefault();
        void this.send(input.value);
      }
    });
  }

  private renderApproval(snapshot: ConversationRuntimeSnapshot): void {
    const approval = snapshot.pendingApproval;
    const conversationId = snapshot.conversation?.id;
    if (!approval || !conversationId) {
      return;
    }

    const container = this.contentEl.createDiv('threadleaf-view__approval');
    container.createEl('strong', { text: 'Approval required' });
    container.createEl('p', { text: approval.description });
    const actions = container.createDiv('threadleaf-view__approval-actions');
    const allow = actions.createEl('button', {
      cls: 'mod-cta',
      text: 'Allow once',
    });
    allow.addEventListener('click', () => {
      this.runtimeCoordinator.respondToApproval(conversationId, 'allow');
    });
    const deny = actions.createEl('button', { text: 'Deny' });
    deny.addEventListener('click', () => {
      this.runtimeCoordinator.respondToApproval(conversationId, 'deny');
    });
  }

  private async createConversation(): Promise<void> {
    const page = this.router.getRoute().page;
    if (!page) {
      return;
    }
    const conversation = await this.conversations.create(this.defaultModel);
    await this.router.associateConversation(conversation.id);
  }

  private async send(rawText: string): Promise<void> {
    const route = this.router.getRoute();
    const text = rawText.trim();
    if (!route.page || !route.activeConversationId || !text) {
      return;
    }
    try {
      await this.runtimeCoordinator.send(
        route.activeConversationId,
        text,
        route.page.path,
      );
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }

  private statusLabel(status: ConversationRuntimeSnapshot['status']): string {
    switch (status) {
      case 'running':
        return 'Running';
      case 'waiting-approval':
        return 'Needs approval';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Ready';
    }
  }
}
