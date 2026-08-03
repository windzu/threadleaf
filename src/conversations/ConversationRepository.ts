import { randomUUID } from 'node:crypto';

import type { Conversation } from '../core/types';
import {
  JsonFileStore,
  type JsonFileAdapter,
} from '../storage/JsonFileStore';
import {
  decodeConversationDocument,
  encodeConversationDocument,
} from './ConversationDocument';

export interface ConversationStore {
  load(conversationId: string): Promise<Conversation | null>;
  save(conversation: Conversation): Promise<void>;
}

export class ConversationRepository implements ConversationStore {
  private stores = new Map<string, JsonFileStore<unknown>>();

  constructor(private readonly adapter: JsonFileAdapter) {}

  async create(
    selectedModel?: string,
    selectedReasoningEffort?: string,
  ): Promise<Conversation> {
    const now = Date.now();
    const conversation: Conversation = {
      id: randomUUID(),
      providerId: 'codex',
      title: 'New conversation',
      createdAt: now,
      updatedAt: now,
      sessionId: null,
      ...(selectedModel ? { selectedModel } : {}),
      ...(selectedReasoningEffort ? { selectedReasoningEffort } : {}),
      messages: [],
    };
    await this.save(conversation);
    return conversation;
  }

  async load(conversationId: string): Promise<Conversation | null> {
    const stored = await this.getStore(conversationId).load();
    if (stored === null) {
      return null;
    }
    return decodeConversationDocument(stored, conversationId).conversation;
  }

  async save(conversation: Conversation): Promise<void> {
    conversation.updatedAt = Date.now();
    await this.getStore(conversation.id).save(
      encodeConversationDocument(conversation),
    );
  }

  async exists(conversationId: string): Promise<boolean> {
    const path = this.getConversationPath(conversationId);
    return path ? this.adapter.exists(path) : false;
  }

  private getStore(conversationId: string): JsonFileStore<unknown> {
    const path = this.getConversationPath(conversationId);
    if (!path) {
      throw new Error(`Invalid conversation id "${conversationId}".`);
    }
    let store = this.stores.get(conversationId);
    if (!store) {
      store = new JsonFileStore(this.adapter, path);
      this.stores.set(conversationId, store);
    }
    return store;
  }

  private getConversationPath(conversationId: string): string | null {
    return /^[a-zA-Z0-9_-]+$/.test(conversationId)
      ? `.windy/conversations/${conversationId}.json`
      : null;
  }
}
