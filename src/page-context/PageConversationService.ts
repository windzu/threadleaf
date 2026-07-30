import type {
  Conversation,
  ConversationMeta,
} from '../core/types';
import type { PageConversationRoute } from './PageConversationRouter';

export interface PageConversationRepository {
  create(selectedModel?: string): Promise<Conversation>;
  load(conversationId: string): Promise<Conversation | null>;
}

export interface PageConversationController {
  associateConversationForPage(
    pagePath: string,
    conversationId: string,
  ): Promise<void>;
  selectConversationForPage(
    pagePath: string,
    conversationId: string,
  ): Promise<void>;
}

export interface PageConversationHistory {
  pagePath: string;
  activeConversationId: string | null;
  conversations: ConversationMeta[];
}

export class PageConversationService {
  private creationFlights = new Map<string, Promise<string>>();

  constructor(
    private readonly router: PageConversationController,
    private readonly conversations: PageConversationRepository,
  ) {}

  async getHistory(
    route: PageConversationRoute,
  ): Promise<PageConversationHistory | null> {
    const pagePath = route.page?.path;
    if (!pagePath) {
      return null;
    }
    const conversations = await Promise.all(
      route.conversationIds.map(async conversationId => {
        try {
          const conversation = await this.conversations.load(conversationId);
          return conversation
            ? this.summarize(conversation)
            : this.unavailableSummary(conversationId);
        } catch {
          return this.unavailableSummary(conversationId);
        }
      }),
    );
    conversations.sort((left, right) => {
      const leftActivity = left.lastResponseAt ?? left.updatedAt;
      const rightActivity = right.lastResponseAt ?? right.updatedAt;
      return rightActivity - leftActivity;
    });
    return {
      pagePath,
      activeConversationId: route.activeConversationId,
      conversations,
    };
  }

  summarize(conversation: Conversation): ConversationMeta {
    const firstUserMessage = conversation.messages.find(
      message => message.role === 'user',
    );
    const latestMessage = [...conversation.messages].reverse().find(
      message => Boolean(message.content.trim()),
    );
    const fallbackTitle = firstUserMessage?.displayContent
      ?? firstUserMessage?.content
      ?? 'New conversation';
    const title = conversation.title !== 'New conversation'
      ? conversation.title
      : fallbackTitle;
    return {
      id: conversation.id,
      providerId: conversation.providerId,
      title: this.compact(title, 52),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastResponseAt: conversation.lastResponseAt,
      messageCount: conversation.messages.length,
      preview: this.compact(latestMessage?.content ?? '', 80),
      titleGenerationStatus: conversation.titleGenerationStatus,
    };
  }

  async selectConversation(
    pagePath: string,
    conversationId: string,
  ): Promise<void> {
    await this.router.selectConversationForPage(pagePath, conversationId);
  }

  async ensureConversationForPage(
    pagePath: string,
    selectedModel?: string,
  ): Promise<string> {
    let flight = this.creationFlights.get(pagePath);
    if (!flight) {
      flight = this.createConversationForPage(pagePath, selectedModel);
      this.creationFlights.set(pagePath, flight);
    }
    try {
      return await flight;
    } finally {
      if (this.creationFlights.get(pagePath) === flight) {
        this.creationFlights.delete(pagePath);
      }
    }
  }

  private async createConversationForPage(
    pagePath: string,
    selectedModel?: string,
  ): Promise<string> {
    const conversation = await this.conversations.create(selectedModel);
    await this.router.associateConversationForPage(pagePath, conversation.id);
    return conversation.id;
  }

  private unavailableSummary(conversationId: string): ConversationMeta {
    return {
      id: conversationId,
      providerId: 'codex',
      title: `Conversation ${conversationId.slice(0, 8)}`,
      createdAt: 0,
      updatedAt: 0,
      messageCount: 0,
      preview: '',
    };
  }

  private compact(value: string, maxLength: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, maxLength - 1)}…`;
  }
}
