import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';

import type { ConversationMeta } from '../core/types';
import type {
  PageConversationRoute,
  PageConversationRouter,
} from '../page-context/PageConversationRouter';
import type { PageConversationService } from '../page-context/PageConversationService';
import type { ConversationModelService } from '../models/types';
import type {
  PageReference,
  PageReferenceService,
} from '../page-context/PageReferenceService';
import type {
  ConversationRuntimeSnapshot,
  RuntimeCoordinator,
} from '../runtime/RuntimeCoordinator';
import { renderConversationHistoryControl } from './ConversationHistoryControl';
import { renderThreadleafComposer } from './ThreadleafComposer';

export const VIEW_TYPE_THREADLEAF = 'threadleaf-agent-view';

interface ComposerDraft {
  text: string;
  references: PageReference[];
  selectedModel?: string;
}

export class ThreadleafView extends ItemView {
  private draftPagePath: string | null = null;
  private history: ConversationMeta[] = [];
  private composerDrafts = new Map<string, ComposerDraft>();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly router: PageConversationRouter,
    private readonly pageConversations: PageConversationService,
    private readonly runtimeCoordinator: RuntimeCoordinator,
    private readonly conversationModels: ConversationModelService,
    private readonly pageReferences: PageReferenceService,
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
        if (snapshot.conversation) {
          const updated = this.pageConversations.summarize(snapshot.conversation);
          this.history = this.history.map(item => (
            item.id === updated.id ? updated : item
          ));
        }
        this.renderConversation(route, snapshot, this.history);
      }
    }));
  }

  private async renderRoute(route: PageConversationRoute): Promise<void> {
    const history = await this.pageConversations.getHistory(route);
    if (
      this.router.getRoute().page?.path !== route.page?.path
      || this.router.getRoute().activeConversationId !== route.activeConversationId
    ) {
      return;
    }
    this.history = history?.conversations ?? [];
    if (this.draftPagePath === route.page?.path) {
      this.renderConversation(route, null, this.history);
      return;
    }
    const conversationId = route.activeConversationId;
    if (!conversationId) {
      this.renderConversation(route, null, this.history);
      return;
    }
    const snapshot = await this.runtimeCoordinator.getSnapshot(conversationId);
    const currentRoute = this.router.getRoute();
    if (
      currentRoute.page?.path === route.page?.path
      && currentRoute.activeConversationId === conversationId
      && this.draftPagePath !== route.page?.path
    ) {
      this.renderConversation(route, snapshot, this.history);
    }
  }

  private renderConversation(
    route: PageConversationRoute,
    snapshot: ConversationRuntimeSnapshot | null,
    history: ConversationMeta[],
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

    if (history.length > 0) {
      renderConversationHistoryControl(this.contentEl, {
        history,
        activeConversationId: route.activeConversationId,
        isDraft: this.draftPagePath === page.path || !snapshot?.conversation,
        onStartDraft: () => this.startDraft(),
        onSelect: async conversationId => {
          this.draftPagePath = null;
          await this.pageConversations.selectConversation(
            page.path,
            conversationId,
          );
        },
      });
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
      if (message.referencedPagePaths?.length) {
        const references = messageElement.createDiv(
          'threadleaf-message__references',
        );
        for (const path of message.referencedPagePaths) {
          references.createSpan({
            cls: 'threadleaf-message__reference',
            text: path,
          });
        }
      }
      messageElement.createDiv({
        cls: 'threadleaf-message__content',
        text: message.displayContent
          ?? (message.content || (message.role === 'assistant' ? '…' : '')),
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

    if (snapshot?.status === 'interrupted') {
      this.renderInterruptedRecovery(snapshot, page.path);
    }

    const status = snapshot?.status ?? 'idle';
    const composerDraft = this.getComposerDraft(page.path);
    const isDraft = !snapshot?.conversation;
    renderThreadleafComposer(this.contentEl, {
      primaryPage: page,
      text: composerDraft.text,
      references: composerDraft.references,
      selectedModel: isDraft
        ? composerDraft.selectedModel
        : snapshot.conversation?.selectedModel,
      status,
      models: this.conversationModels,
      referenceService: this.pageReferences,
      onDraftChange: (text, references) => {
        composerDraft.text = text;
        composerDraft.references = references;
      },
      onModelSelect: async model => {
        if (!snapshot?.conversation) {
          composerDraft.selectedModel = model ?? undefined;
          this.renderConversation(route, snapshot, history);
          return;
        }
        await this.conversationModels.select(snapshot.conversation.id, model);
      },
      onSubmit: text => {
        void this.send(text);
      },
      onStop: () => {
        const conversationId = snapshot?.conversation?.id;
        if (conversationId) {
          this.runtimeCoordinator.cancel(conversationId);
        }
      },
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

  private renderInterruptedRecovery(
    snapshot: ConversationRuntimeSnapshot,
    pagePath: string,
  ): void {
    const conversationId = snapshot.conversation?.id;
    if (!conversationId) {
      return;
    }
    const container = this.contentEl.createDiv('threadleaf-view__interrupted');
    container.createEl('strong', { text: 'Response interrupted' });
    container.createEl('p', {
      text: 'Partial output was preserved. Retry the original request or continue from here.',
    });
    const actions = container.createDiv('threadleaf-view__interrupted-actions');
    const retry = actions.createEl('button', { text: 'Retry' });
    retry.addEventListener('click', () => {
      this.runRecoveryAction(
        () => this.runtimeCoordinator.retryInterrupted(conversationId),
      );
    });
    const continueButton = actions.createEl('button', {
      cls: 'mod-cta',
      text: 'Continue',
    });
    continueButton.addEventListener('click', () => {
      this.runRecoveryAction(
        () => this.runtimeCoordinator.continueInterrupted(
          conversationId,
          pagePath,
        ),
      );
    });
  }

  private runRecoveryAction(action: () => Promise<void>): void {
    void action().catch(error => {
      new Notice(error instanceof Error ? error.message : String(error));
    });
  }

  private startDraft(): void {
    const route = this.router.getRoute();
    if (!route.page) {
      return;
    }
    this.draftPagePath = route.page.path;
    this.composerDrafts.set(route.page.path, {
      text: '',
      references: [],
    });
    this.renderConversation(route, null, this.history);
  }

  private async send(rawText: string): Promise<void> {
    const route = this.router.getRoute();
    const text = rawText.trim();
    if (!route.page || !text) {
      return;
    }
    const pagePath = route.page.path;
    const composerDraft = this.getComposerDraft(pagePath);
    const referencedPagePaths = composerDraft.references.map(
      reference => reference.path,
    );
    try {
      const conversationId = this.draftPagePath === pagePath
        || !route.activeConversationId
        ? await this.pageConversations.ensureConversationForPage(
          pagePath,
          composerDraft.selectedModel,
        )
        : route.activeConversationId;
      if (this.draftPagePath === pagePath) {
        this.draftPagePath = null;
      }
      this.composerDrafts.delete(pagePath);
      await this.runtimeCoordinator.send(
        conversationId,
        text,
        pagePath,
        referencedPagePaths,
      );
    } catch (error) {
      if (!this.composerDrafts.has(pagePath)) {
        this.composerDrafts.set(pagePath, composerDraft);
      }
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }

  private getComposerDraft(pagePath: string): ComposerDraft {
    let draft = this.composerDrafts.get(pagePath);
    if (!draft) {
      draft = { text: '', references: [] };
      this.composerDrafts.set(pagePath, draft);
    }
    return draft;
  }

}
