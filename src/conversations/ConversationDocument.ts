import type { Conversation } from '../core/types';

export const CONVERSATION_DOCUMENT_VERSION = 2;

export interface ConversationDocumentV2 {
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidActiveTurn(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (
      value.status === 'running'
      || value.status === 'waiting-approval'
      || value.status === 'interrupted'
    )
    && typeof value.userMessageId === 'string'
    && typeof value.assistantMessageId === 'string'
    && typeof value.primaryPagePath === 'string'
    && isFiniteNumber(value.startedAt)
    && isFiniteNumber(value.updatedAt)
    && (
      value.interruptedAt === undefined
      || isFiniteNumber(value.interruptedAt)
    )
  );
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
    || !isFiniteNumber(value.createdAt)
    || !isFiniteNumber(value.updatedAt)
    || !Array.isArray(value.messages)
    || (
      value.activeTurn !== undefined
      && !isValidActiveTurn(value.activeTurn)
    )
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
    if (value.version !== 1 && value.version !== CONVERSATION_DOCUMENT_VERSION) {
      throw new Error(
        `Conversation "${expectedId}" uses unsupported schema version "${String(value.version)}".`,
      );
    }
    return {
      conversation: decodeConversation(value.conversation, expectedId),
      migratedFromLegacy: value.version !== CONVERSATION_DOCUMENT_VERSION,
    };
  }

  return {
    conversation: decodeConversation(value, expectedId),
    migratedFromLegacy: true,
  };
}

export function encodeConversationDocument(
  conversation: Conversation,
): ConversationDocumentV2 {
  return {
    version: CONVERSATION_DOCUMENT_VERSION,
    conversation: structuredClone(conversation),
  };
}
