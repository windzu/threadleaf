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
  private draftPagePath: string | null = null;
  private conversationCreationFlights = new Map<string, Promise<string>>();

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

  focusComposer(): void {
    this.contentEl
      .querySelector<HTMLTextAreaElement>('.threadleaf-view__input')
      ?.focus();
  }

  async onOpen(): Promise<void> {
    await this.renderRoute(this.router.getRoute());
    this.register(this.router.onChange(route => {
      if (this.draftPagePath && this.draftPagePath !== route.page?.path) {
        this.draftPagePath = null;
      }
      void this.renderRoute(route);
    }));
    this.register(this.runtimeCoordinator.onChange((conversationId, snapshot) => {
      const route = this.router.getRoute();
      if (
        this.draftPagePath !== route.page?.path
        && conversationId === route.activeConversationId
      ) {
        this.renderConversation(route, snapshot);
      }
    }));
  }

  private async renderRoute(route: PageConversationRoute): Promise<void> {
    if (this.draftPagePath === route.page?.path) {
      this.renderConversation(route, null);
      return;
    }
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

    if (route.conversationIds.length > 0) {
      const conversationBar = this.contentEl.createDiv(
        'threadleaf-view__conversation-bar',
      );
      const isDraft = this.draftPagePath === page.path
        || !snapshot?.conversation;
      const selector = conversationBar.createEl('select', {
        cls: 'dropdown threadleaf-view__conversation-select',
      });
      if (isDraft) {
        selector.createEl('option', {
          value: '',
          text: 'New conversation',
        });
      }
      for (const conversationId of route.conversationIds) {
        selector.createEl('option', {
          value: conversationId,
          text: conversationId === route.activeConversationId
            ? snapshot?.conversation?.title ?? 'Current conversation'
            : `Conversation ${conversationId.slice(0, 8)}`,
        });
      }
      selector.value = isDraft ? '' : route.activeConversationId ?? '';
      selector.addEventListener('change', () => {
        if (!selector.value) {
          return;
        }
        this.draftPagePath = null;
        void this.router.selectConversation(selector.value);
      });

      if (!isDraft) {
        const newButton = conversationBar.createEl('button', {
          cls: 'threadleaf-view__new-conversation',
          text: 'New',
        });
        newButton.addEventListener('click', () => {
          this.startDraft();
        });
      }
    }

    const messages = this.contentEl.createDiv('threadleaf-view__messages');
    if (!snapshot?.conversation) {
      messages.createDiv({
        cls: 'threadleaf-view__empty',
        text: `Ask anything about ${page.basename}.`,
      });
    }
    for (const message of snapshot?.conversation?.messages ?? []) {
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

    if (snapshot?.pendingApproval) {
      this.renderApproval(snapshot);
    }

    if (snapshot?.error) {
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
    const status = snapshot?.status ?? 'idle';
    actions.createDiv({
      cls: `threadleaf-view__status threadleaf-view__status--${status}`,
      text: this.statusLabel(status),
    });
    const isRunning = status === 'running' || status === 'waiting-approval';
    const sendButton = actions.createEl('button', {
      cls: 'mod-cta',
      text: isRunning ? 'Stop' : 'Send',
    });
    sendButton.addEventListener('click', () => {
      if (isRunning) {
        const conversationId = snapshot?.conversation?.id;
        if (conversationId) {
          this.runtimeCoordinator.cancel(conversationId);
        }
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

  private startDraft(): void {
    const route = this.router.getRoute();
    if (!route.page) {
      return;
    }
    this.draftPagePath = route.page.path;
    this.renderConversation(route, null);
  }

  private async send(rawText: string): Promise<void> {
    const route = this.router.getRoute();
    const text = rawText.trim();
    if (!route.page || !text) {
      return;
    }
    const pagePath = route.page.path;
    try {
      const conversationId = this.draftPagePath === pagePath
        || !route.activeConversationId
        ? await this.ensureConversationForPage(pagePath)
        : route.activeConversationId;
      await this.runtimeCoordinator.send(
        conversationId,
        text,
        pagePath,
      );
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }

  private async ensureConversationForPage(pagePath: string): Promise<string> {
    let flight = this.conversationCreationFlights.get(pagePath);
    if (!flight) {
      flight = this.createConversationForPage(pagePath);
      this.conversationCreationFlights.set(pagePath, flight);
    }
    try {
      return await flight;
    } finally {
      if (this.conversationCreationFlights.get(pagePath) === flight) {
        this.conversationCreationFlights.delete(pagePath);
      }
    }
  }

  private async createConversationForPage(pagePath: string): Promise<string> {
    const conversation = await this.conversations.create(this.defaultModel);
    await this.router.associateConversationForPage(pagePath, conversation.id);
    if (this.draftPagePath === pagePath) {
      this.draftPagePath = null;
      if (this.router.getRoute().page?.path === pagePath) {
        void this.renderRoute(this.router.getRoute());
      }
    }
    return conversation.id;
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
