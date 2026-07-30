const DEFAULT_MAX_TITLE_LENGTH = 52;

export function deriveConversationTitle(
  firstRequest: string,
  maxLength = DEFAULT_MAX_TITLE_LENGTH,
): string {
  const normalized = firstRequest.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'New conversation';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}
