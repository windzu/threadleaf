import type { ToolCallInfo } from '../core/types';

const MAX_TOOL_PAYLOAD_LENGTH = 12_000;

export function formatToolName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLocaleLowerCase();
  return words
    ? words.charAt(0).toLocaleUpperCase() + words.slice(1)
    : 'Tool';
}

export function toolStatusLabel(status: ToolCallInfo['status']): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'error':
      return 'Failed';
    case 'blocked':
      return 'Blocked';
  }
}

export function toolStatusIcon(status: ToolCallInfo['status']): string {
  switch (status) {
    case 'running':
      return 'loader-circle';
    case 'completed':
      return 'circle-check';
    case 'error':
      return 'circle-alert';
    case 'blocked':
      return 'ban';
  }
}

export function formatToolPayload(
  value: unknown,
  maxLength = MAX_TOOL_PAYLOAD_LENGTH,
): string {
  let formatted: string;
  if (typeof value === 'string') {
    formatted = value;
  } else {
    try {
      formatted = JSON.stringify(value, null, 2) ?? String(value);
    } catch {
      formatted = String(value);
    }
  }
  if (formatted.length <= maxLength) {
    return formatted;
  }
  return `${formatted.slice(0, maxLength)}\n… output truncated`;
}
