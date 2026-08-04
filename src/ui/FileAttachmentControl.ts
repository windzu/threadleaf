import * as path from 'node:path';

import { Notice, setIcon, setTooltip } from 'obsidian';

import type { FileAttachment } from '../core/types';
import {
  buildFileAttachments,
  mergeFileAttachments,
  type NativeFileLike,
} from '../utils/fileAttachment';

export interface FileAttachmentControlOptions {
  attachments: FileAttachment[];
  disabled: boolean;
  vaultPath: string | null;
  onChange: (attachments: FileAttachment[]) => void;
}

export interface FileAttachmentControl {
  openPicker(): void;
  getAttachments(): FileAttachment[];
}

export function renderFileAttachmentControl(
  composer: HTMLElement,
  options: FileAttachmentControlOptions,
): FileAttachmentControl {
  let attachments = [...options.attachments];
  const chips = composer.createDiv('windy-composer__file-attachments');
  const picker = composer.createEl('input', {
    cls: 'windy-composer__file-picker',
    attr: {
      type: 'file',
      multiple: 'true',
      tabindex: '-1',
      'aria-hidden': 'true',
    },
  });
  renderChips();

  picker.addEventListener('change', () => {
    const files = Array.from(picker.files ?? []);
    picker.value = '';
    void addFiles(files, 'picker');
  });

  composer.addEventListener('dragenter', event => {
    if (!options.disabled && containsFiles(event.dataTransfer)) {
      event.preventDefault();
      composer.addClass('is-dragging-files');
    }
  });
  composer.addEventListener('dragover', event => {
    if (!options.disabled && containsFiles(event.dataTransfer)) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      composer.addClass('is-dragging-files');
    }
  });
  composer.addEventListener('dragleave', event => {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof composer.ownerDocument.defaultView!.Node)
      || !composer.contains(nextTarget)) {
      composer.removeClass('is-dragging-files');
    }
  });
  composer.addEventListener('drop', event => {
    composer.removeClass('is-dragging-files');
    if (options.disabled || !containsFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    void addFiles(Array.from(event.dataTransfer?.files ?? []), 'drop');
  });

  return {
    openPicker(): void {
      if (!options.disabled) {
        picker.click();
      }
    },
    getAttachments: () => [...attachments],
  };

  async function addFiles(
    files: NativeFileLike[],
    source: FileAttachment['source'],
  ): Promise<void> {
    const result = await buildFileAttachments(files, {
      source,
      vaultPath: options.vaultPath,
    });
    attachments = mergeFileAttachments(attachments, result.attachments);
    options.onChange([...attachments]);
    renderChips();
    if (result.rejected.length > 0) {
      new Notice(
        `Could not attach ${result.rejected.length} item(s). `
          + 'Windy only references local files with an accessible path.',
      );
    }
  }

  function renderChips(): void {
    chips.empty();
    chips.toggleClass('is-empty', attachments.length === 0);
    for (const attachment of attachments) {
      const chip = chips.createDiv('windy-composer__file-chip');
      const icon = chip.createSpan('windy-composer__file-icon');
      setIcon(icon, attachmentIcon(attachment));
      const labels = chip.createSpan('windy-composer__file-labels');
      labels.createSpan({
        cls: 'windy-composer__file-name',
        text: attachment.name,
      });
      labels.createSpan({
        cls: 'windy-composer__file-size',
        text: formatFileSize(attachment.size),
      });
      setTooltip(chip, attachment.path);
      const remove = chip.createEl('button', {
        cls: 'windy-composer__file-remove clickable-icon',
        attr: {
          type: 'button',
          'aria-label': `Remove ${attachment.name}`,
        },
      });
      setIcon(remove, 'x');
      remove.disabled = options.disabled;
      remove.addEventListener('click', () => {
        attachments = attachments.filter(item => item.id !== attachment.id);
        options.onChange([...attachments]);
        renderChips();
      });
    }
  }
}

function containsFiles(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes('Files'));
}

export function attachmentIcon(attachment: Pick<FileAttachment, 'name' | 'mediaType'>): string {
  const mediaType = attachment.mediaType?.toLowerCase() ?? '';
  const extension = path.extname(attachment.name).toLowerCase();
  if (mediaType.startsWith('image/')) return 'image';
  if (['.zip', '.7z', '.rar', '.tar', '.gz', '.bz2', '.xz'].includes(extension)) {
    return 'file-archive';
  }
  if (['.csv', '.xls', '.xlsm', '.xlsx', '.ods', '.tsv'].includes(extension)) {
    return 'sheet';
  }
  if (['.doc', '.docx', '.md', '.pdf', '.rtf', '.txt'].includes(extension)) {
    return 'file-text';
  }
  return 'file';
}

export function attachmentTypeLabel(
  attachment: Pick<FileAttachment, 'name' | 'mediaType'>,
): string {
  const extension = path.extname(attachment.name).slice(1).trim();
  if (extension) {
    return extension.toLocaleUpperCase();
  }
  return attachment.mediaType?.trim() || 'File';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
