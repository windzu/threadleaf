import { setIcon } from 'obsidian';

import type {
  PageReference,
  PageReferenceService,
} from '../page-context/PageReferenceService';

export interface PageReferenceComposerOptions {
  primaryPage: PageReference;
  text: string;
  references: PageReference[];
  disabled: boolean;
  referenceService: PageReferenceService;
  onChange: (text: string, references: PageReference[]) => void;
  onSubmit: (text: string) => void;
}

export interface PageReferenceComposerControl {
  input: HTMLTextAreaElement;
  createAddButton(container: HTMLElement): HTMLButtonElement;
}

interface MentionRange {
  start: number;
  end: number;
}

export function renderPageReferenceComposer(
  container: HTMLElement,
  options: PageReferenceComposerOptions,
): PageReferenceComposerControl {
  let references = [...options.references];
  let results: PageReference[] = [];
  let activeResult = 0;
  let mentionRange: MentionRange | null = null;
  let popup: HTMLElement | null = null;

  const chips = container.createDiv('threadleaf-composer__references');
  renderChips();
  const input = container.createEl('textarea', {
    cls: 'threadleaf-view__input',
    attr: {
      placeholder: `Ask about ${options.primaryPage.basename}…`,
      rows: '3',
    },
  });
  input.value = options.text;
  input.disabled = options.disabled;

  input.addEventListener('input', () => {
    options.onChange(input.value, references);
    const match = findMention(input);
    if (!match) {
      closePopup();
      return;
    }
    mentionRange = { start: match.start, end: input.selectionStart };
    showResults(match.query);
  });
  input.addEventListener('keydown', event => {
    if (popup && results.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        activeResult = (activeResult + direction + results.length) % results.length;
        renderPopup();
        return;
      }
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        selectReference(results[activeResult]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closePopup();
        return;
      }
    }
    if (
      event.key === 'Enter'
      && !event.shiftKey
      && !event.isComposing
      && !options.disabled
    ) {
      event.preventDefault();
      options.onSubmit(input.value);
    }
  });

  return {
    input,
    createAddButton(actions: HTMLElement): HTMLButtonElement {
      const button = actions.createEl('button', {
        cls: 'threadleaf-view__add-reference clickable-icon',
        attr: {
          type: 'button',
          'aria-label': 'Add page context',
        },
      });
      setIcon(button, 'plus');
      button.disabled = options.disabled;
      button.addEventListener('click', () => {
        mentionRange = null;
        showResults('');
      });
      return button;
    },
  };

  function findMention(textarea: HTMLTextAreaElement): {
    start: number;
    query: string;
  } | null {
    const beforeCursor = textarea.value.slice(0, textarea.selectionStart);
    const match = beforeCursor.match(/(?:^|\s)@([^@\n]*)$/);
    if (!match) {
      return null;
    }
    const prefixLength = match[0].startsWith('@') ? 0 : 1;
    return {
      start: beforeCursor.length - match[0].length + prefixLength,
      query: match[1],
    };
  }

  function showResults(query: string): void {
    results = options.referenceService.search(
      query,
      [
        options.primaryPage.path,
        ...references.map(reference => reference.path),
      ],
    );
    activeResult = 0;
    renderPopup();
  }

  function renderPopup(): void {
    closePopup(false);
    popup = container.createDiv('threadleaf-composer__mention-popup');
    if (results.length === 0) {
      popup.createDiv({
        cls: 'threadleaf-composer__mention-empty',
        text: 'No matching pages',
      });
      return;
    }
    for (const [index, reference] of results.entries()) {
      const item = popup.createEl('button', {
        cls: `threadleaf-composer__mention-result${
          index === activeResult ? ' is-active' : ''
        }`,
        attr: { type: 'button' },
      });
      const icon = item.createSpan('threadleaf-composer__mention-icon');
      setIcon(icon, reference.extension === 'base' ? 'database' : 'file-text');
      const labels = item.createSpan('threadleaf-composer__mention-labels');
      labels.createSpan({
        cls: 'threadleaf-composer__mention-title',
        text: reference.basename,
      });
      labels.createSpan({
        cls: 'threadleaf-composer__mention-path',
        text: reference.path,
      });
      item.addEventListener('mousedown', event => event.preventDefault());
      item.addEventListener('click', () => selectReference(reference));
    }
  }

  function selectReference(reference: PageReference): void {
    if (!references.some(item => item.path === reference.path)) {
      references = [...references, reference];
    }
    if (mentionRange) {
      input.value = (
        input.value.slice(0, mentionRange.start)
        + input.value.slice(mentionRange.end)
      );
      input.selectionStart = mentionRange.start;
      input.selectionEnd = mentionRange.start;
    }
    mentionRange = null;
    options.onChange(input.value, references);
    renderChips();
    closePopup();
    input.focus();
  }

  function renderChips(): void {
    chips.empty();
    renderChip(options.primaryPage, false);
    for (const reference of references) {
      renderChip(reference, true);
    }
  }

  function renderChip(reference: PageReference, removable: boolean): void {
    const chip = chips.createDiv('threadleaf-composer__reference-chip');
    const icon = chip.createSpan('threadleaf-composer__reference-icon');
    setIcon(icon, reference.extension === 'base' ? 'database' : 'file-text');
    chip.createSpan({
      cls: 'threadleaf-composer__reference-title',
      text: reference.basename,
    });
    chip.setAttribute('aria-label', reference.path);
    if (!removable) {
      return;
    }
    const remove = chip.createEl('button', {
      cls: 'threadleaf-composer__reference-remove clickable-icon',
      attr: {
        type: 'button',
        'aria-label': `Remove ${reference.basename}`,
      },
    });
    setIcon(remove, 'x');
    remove.addEventListener('click', () => {
      references = references.filter(item => item.path !== reference.path);
      options.onChange(input.value, references);
      renderChips();
      input.focus();
    });
  }

  function closePopup(clearResults = true): void {
    popup?.remove();
    popup = null;
    if (clearResults) {
      results = [];
      activeResult = 0;
      mentionRange = null;
    }
  }
}
