import { setIcon } from 'obsidian';

import type {
  PageReference,
  PageReferenceService,
} from '../page-context/PageReferenceService';
import {
  attachPageReference,
  type ComposerPageReference,
  findPageMentionQuery,
  insertInlinePageReference,
  reconcileInlinePageReferences,
  splitPageMentionText,
  type TextRange,
} from './pageReferenceMentions';

export interface PageReferenceComposerOptions {
  primaryPage: PageReference;
  text: string;
  references: ComposerPageReference[];
  disabled: boolean;
  referenceService: PageReferenceService;
  onChange: (text: string, references: ComposerPageReference[]) => void;
  onSubmit: (text: string) => void;
}

export interface PageReferenceComposerControl {
  input: HTMLDivElement;
  getText(): string;
  openReferencePicker(): void;
}

export function renderPageReferenceComposer(
  container: HTMLElement,
  options: PageReferenceComposerOptions,
): PageReferenceComposerControl {
  let references = [...options.references];
  let results: PageReference[] = [];
  let activeResult = 0;
  let mentionRange: TextRange | null = null;
  let popup: HTMLElement | null = null;

  const chips = container.createDiv('windy-composer__references');
  renderChips();
  const input = container.createDiv({
    cls: 'windy-view__input',
    attr: {
      contenteditable: String(!options.disabled),
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-disabled': String(options.disabled),
      'data-placeholder': 'Ask to edit, explain, or organize this page…',
    },
  });
  input.spellcheck = true;
  renderEditorText(options.text);

  input.addEventListener('input', () => {
    const text = readEditorText(input);
    references = reconcileInlinePageReferences(text, references);
    options.onChange(text, references);
    const caret = getEditorCaretOffset(input);
    const match = caret === null
      ? null
      : findPageMentionQuery(
        text,
        caret,
        getEditorMentionRanges(input),
      );
    if (!match) {
      closePopup();
      return;
    }
    mentionRange = { start: match.start, end: match.end };
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
      options.onSubmit(readEditorText(input));
    }
  });
  input.addEventListener('paste', event => {
    if (options.disabled) {
      return;
    }
    event.preventDefault();
    insertPlainText(input, event.clipboardData?.getData('text/plain') ?? '');
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });

  return {
    input,
    getText: () => readEditorText(input),
    openReferencePicker(): void {
      if (!options.disabled) {
        mentionRange = null;
        showResults('');
      }
    },
  };

  function showResults(query: string): void {
    results = options.referenceService.search(
      query,
      [
        options.primaryPage.path,
        ...references.map(reference => reference.page.path),
      ],
    );
    activeResult = 0;
    renderPopup();
  }

  function renderPopup(): void {
    closePopup(false);
    popup = container.createDiv('windy-composer__mention-popup');
    if (results.length === 0) {
      popup.createDiv({
        cls: 'windy-composer__mention-empty',
        text: 'No matching pages',
      });
      return;
    }
    for (const [index, reference] of results.entries()) {
      const item = popup.createEl('button', {
        cls: `windy-composer__mention-result${
          index === activeResult ? ' is-active' : ''
        }`,
        attr: { type: 'button' },
      });
      const icon = item.createSpan('windy-composer__mention-icon');
      setIcon(icon, reference.extension === 'base' ? 'database' : 'file-text');
      const labels = item.createSpan('windy-composer__mention-labels');
      labels.createSpan({
        cls: 'windy-composer__mention-title',
        text: reference.basename,
      });
      labels.createSpan({
        cls: 'windy-composer__mention-path',
        text: reference.path,
      });
      item.addEventListener('mousedown', event => event.preventDefault());
      item.addEventListener('click', () => selectReference(reference));
    }
  }

  function selectReference(reference: PageReference): void {
    if (mentionRange) {
      const selection = insertInlinePageReference(
        readEditorText(input),
        mentionRange,
        reference,
        references,
      );
      references = selection.references;
      renderEditorText(selection.text);
      setEditorCaretOffset(input, selection.caret);
    } else {
      references = attachPageReference(references, reference);
    }
    mentionRange = null;
    options.onChange(readEditorText(input), references);
    renderChips();
    closePopup();
    input.focus();
  }

  function renderChips(): void {
    chips.empty();
    renderChip(options.primaryPage, false);
    for (const reference of references) {
      if (reference.placement === 'attached') {
        renderChip(reference.page, true);
      }
    }
  }

  function renderChip(reference: PageReference, removable: boolean): void {
    const chip = chips.createDiv('windy-composer__reference-chip');
    const icon = chip.createSpan('windy-composer__reference-icon');
    setIcon(icon, reference.extension === 'base' ? 'database' : 'file-text');
    chip.createSpan({
      cls: 'windy-composer__reference-title',
      text: reference.basename,
    });
    chip.setAttribute('aria-label', reference.path);
    if (!removable) {
      return;
    }
    const remove = chip.createEl('button', {
      cls: 'windy-composer__reference-remove clickable-icon',
      attr: {
        type: 'button',
        'aria-label': `Remove ${reference.basename}`,
      },
    });
    setIcon(remove, 'x');
    remove.addEventListener('click', () => {
      references = references.filter(
        item => item.page.path !== reference.path,
      );
      options.onChange(readEditorText(input), references);
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

  function renderEditorText(text: string): void {
    input.empty();
    const inlineReferences = references.filter(
      reference => reference.placement === 'inline',
    );
    const referencesByPath = new Map(
      inlineReferences.map(reference => [reference.page.path, reference.page]),
    );
    const segments = splitPageMentionText(
      text,
      inlineReferences.map(reference => reference.page.path),
    );
    for (const segment of segments) {
      if (segment.type === 'text') {
        input.appendText(segment.text);
        continue;
      }
      const reference = referencesByPath.get(segment.path);
      if (!reference) {
        input.appendText(`@${segment.path}`);
        continue;
      }
      renderInlineReference(input, reference);
    }
  }
}

function renderInlineReference(
  container: HTMLElement,
  reference: PageReference,
): void {
  const mention = container.createSpan({
    cls: 'windy-composer__inline-reference',
    attr: {
      contenteditable: 'false',
      'data-page-path': reference.path,
      'aria-label': `Page: ${reference.path}`,
      title: reference.path,
    },
  });
  const icon = mention.createSpan('windy-composer__inline-reference-icon');
  setIcon(icon, reference.extension === 'base' ? 'database' : 'file-text');
  mention.createSpan({
    cls: 'windy-composer__inline-reference-title',
    text: reference.basename,
  });
}

function readEditorText(root: Node): string {
  if (root instanceof HTMLElement) {
    const path = root.dataset.pagePath;
    if (path) {
      return `@${path}`;
    }
  }
  if (root instanceof HTMLBRElement) {
    return '\n';
  }
  if (root instanceof Text) {
    return root.data;
  }
  return [...root.childNodes].map(readEditorText).join('');
}

function getEditorCaretOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (
    !selection
    || !selection.isCollapsed
    || !selection.focusNode
    || !root.contains(selection.focusNode)
  ) {
    return null;
  }
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(selection.focusNode, selection.focusOffset);
  return readEditorText(range.cloneContents()).length;
}

function getEditorMentionRanges(root: Node): TextRange[] {
  const ranges: TextRange[] = [];
  let offset = 0;
  const visit = (node: Node): void => {
    if (node instanceof HTMLElement && node.dataset.pagePath) {
      const start = offset;
      offset += `@${node.dataset.pagePath}`.length;
      ranges.push({ start, end: offset });
      return;
    }
    if (node instanceof HTMLBRElement) {
      offset += 1;
      return;
    }
    if (node instanceof Text) {
      offset += node.data.length;
      return;
    }
    for (const child of [...node.childNodes]) {
      visit(child);
    }
  };
  visit(root);
  return ranges;
}

function setEditorCaretOffset(root: HTMLElement, offset: number): void {
  const range = document.createRange();
  let remaining = Math.max(0, offset);
  for (const node of [...root.childNodes]) {
    const length = readEditorText(node).length;
    if (node instanceof Text && remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      applySelection(range);
      return;
    }
    if (remaining <= length) {
      if (remaining === 0) {
        range.setStartBefore(node);
      } else {
        range.setStartAfter(node);
      }
      range.collapse(true);
      applySelection(range);
      return;
    }
    remaining -= length;
  }
  range.selectNodeContents(root);
  range.collapse(false);
  applySelection(range);
}

function applySelection(range: Range): void {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function insertPlainText(root: HTMLElement, text: string): void {
  const selection = window.getSelection();
  if (
    !selection
    || selection.rangeCount === 0
    || !selection.focusNode
    || !root.contains(selection.focusNode)
  ) {
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  applySelection(range);
}
