import type { Conversation } from '../core/types';

export const CONVERSATION_DOCUMENT_VERSION = 1;

export interface ConversationDocumentV1 {
  version: typeof CONVERSATION_DOCUMENT_VERSION;
  conversation: Conversation;
}

export interface DecodedConversationDocument {
  conversation: Conversation;
  migratedFromLegacy: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeConversation(value: unknown, expectedId: string): Conversation {
  if (!isRecord(value)) {
    throw new Error(`Conversation "${expectedId}" is not a JSON object.`);
  }
  if (value.id !== expectedId) {
    throw new Error(`Conversation file "${expectedId}" contains a different id.`);
  }
  if (
    typeof value.providerId !== 'string'
    || typeof value.title !== 'string'
    || typeof value.createdAt !== 'number'
    || !Number.isFinite(value.createdAt)
    || typeof value.updatedAt !== 'number'
    || !Number.isFinite(value.updatedAt)
    || !Array.isArray(value.messages)
  ) {
    throw new Error(`Conversation "${expectedId}" has an invalid schema.`);
  }
  if (value.sessionId !== null && typeof value.sessionId !== 'string') {
    throw new Error(`Conversation "${expectedId}" has an invalid session id.`);
  }
  return structuredClone(value) as unknown as Conversation;
}

export function decodeConversationDocument(
  value: unknown,
  expectedId: string,
): DecodedConversationDocument {
  if (!isRecord(value)) {
    throw new Error(`Conversation "${expectedId}" has an invalid document.`);
  }

  if ('version' in value) {
    if (value.version !== CONVERSATION_DOCUMENT_VERSION) {
      throw new Error(
        `Conversation "${expectedId}" uses unsupported schema version "${String(value.version)}".`,
      );
    }
    return {
      conversation: decodeConversation(value.conversation, expectedId),
      migratedFromLegacy: false,
    };
  }

  return {
    conversation: decodeConversation(value, expectedId),
    migratedFromLegacy: true,
  };
}

export function encodeConversationDocument(
  conversation: Conversation,
): ConversationDocumentV1 {
  return {
    version: CONVERSATION_DOCUMENT_VERSION,
    conversation: structuredClone(conversation),
  };
}
