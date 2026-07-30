import type { ApprovalCallbackOptions } from '../core/runtime/types';
import type { Conversation } from '../core/types';

export type ConversationTaskStatus =
  | 'idle'
  | 'running'
  | 'waiting-approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export interface PendingApproval {
  toolName: string;
  input: Record<string, unknown>;
  description: string;
  options?: ApprovalCallbackOptions;
}

export interface ConversationRuntimeSnapshot {
  conversation: Conversation | null;
  status: ConversationTaskStatus;
  error: string | null;
  pendingApproval: PendingApproval | null;
}

export type RuntimeActivityStatus =
  | 'idle'
  | 'running'
  | 'waiting-approval'
  | 'completed'
  | 'failed'
  | 'interrupted';

export interface RuntimeActivitySummary {
  status: RuntimeActivityStatus;
  badgeCount: number;
  runningCount: number;
  waitingApprovalCount: number;
  failedCount: number;
  interruptedCount: number;
}
