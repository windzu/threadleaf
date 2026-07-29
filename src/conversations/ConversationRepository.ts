import { randomUUID } from 'node:crypto';

import type { DataAdapter } from 'obsidian';

import type { Conversation } from '../core/types';
import { JsonFileStore } from '../storage/JsonFileStore';

export interface ConversationStore {
  load(conversationId: string): Promise<Conversation | null>;
  save(conversation: Conversation): Promise<void>;
}

export class ConversationRepository implements ConversationStore {
  private stores = new Map<string, JsonFileStore<Conversation>>();

  constructor(private readonly adapter: DataAdapter) {}

  async create(selectedModel: string): Promise<Conversation> {
    const now = Date.now();
    const conversation: Conversation = {
      id: randomUUID(),
      providerId: 'codex',
      title: 'New conversation',
      createdAt: now,
      updatedAt: now,
      sessionId: null,
      selectedModel,
      messages: [],
    };
    await this.save(conversation);
    return conversation;
  }

  async load(conversationId: string): Promise<Conversation | null> {
    return this.getStore(conversationId).load();
  }

  async save(conversation: Conversation): Promise<void> {
    conversation.updatedAt = Date.now();
    await this.getStore(conversation.id).save(conversation);
  }

  private getStore(conversationId: string): JsonFileStore<Conversation> {
    let store = this.stores.get(conversationId);
    if (!store) {
      store = new JsonFileStore(
        this.adapter,
        `.threadleaf/conversations/${conversationId}.json`,
      );
      this.stores.set(conversationId, store);
    }
    return store;
  }
}
