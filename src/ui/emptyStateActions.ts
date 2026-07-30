export interface EmptyStateAction {
  icon: string;
  label: string;
  prompt: string;
}

export const EMPTY_STATE_ACTIONS: readonly EmptyStateAction[] = [
  {
    icon: 'list-collapse',
    label: 'Summarize this page',
    prompt: 'Summarize this page and highlight its most important points.',
  },
  {
    icon: 'wand-sparkles',
    label: 'Improve the writing',
    prompt: 'Review this page and suggest concrete improvements to the writing.',
  },
  {
    icon: 'search',
    label: 'Find gaps and questions',
    prompt: 'Identify gaps, unclear claims, and important unanswered questions on this page.',
  },
  {
    icon: 'list-todo',
    label: 'Create an action plan',
    prompt: 'Turn the content of this page into a clear, prioritized action plan.',
  },
];
