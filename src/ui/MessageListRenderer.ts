import * as fs from 'node:fs';

import {
  type App,
  Component,
  MarkdownRenderer,
  setIcon,
} from 'obsidian';

import type {
  ChatMessage,
  ToolCallInfo,
} from '../core/types';
import {
  isInlinePageReference,
  splitPageMentionText,
} from './pageReferenceMentions';
import type { ConversationTaskStatus } from '../runtime/RuntimeCoordinator';
import {
  formatToolName,
  formatToolPayload,
  toolStatusIcon,
  toolStatusLabel,
} from './messageFormatting';
import { WINDY_NAV_ICON } from './icons';
import {
  attachmentIcon,
  attachmentTypeLabel,
  formatFileSize,
} from './FileAttachmentControl';
import { resolveFileAttachmentPath } from '../utils/fileAttachment';
import { getVaultPath } from '../utils/path';

export class MessageListRenderer extends Component {
  constructor(private readonly app: App) {
    super();
  }

  async render(
    container: HTMLElement,
    messages: ChatMessage[],
    sourcePath: string,
    status: ConversationTaskStatus,
  ): Promise<void> {
    const markdownRenders: Promise<void>[] = [];
    for (const [index, message] of messages.entries()) {
      const messageElement = container.createDiv({
        cls: `windy-message windy-message--${message.role}`,
      });
      const role = messageElement.createDiv('windy-message__role');
      const roleIcon = role.createSpan('windy-message__role-icon');
      setIcon(roleIcon, message.role === 'user' ? 'user-round' : WINDY_NAV_ICON);
      role.createSpan({
        text: message.role === 'user' ? 'You' : 'Windy',
      });
      this.renderFileAttachments(messageElement, message);
      this.renderReferences(messageElement, message);
      if (message.role === 'assistant') {
        const activity = messageElement.createDiv('windy-message__activity');
        this.renderThinking(activity, message);
        this.renderTools(activity, message.toolCalls ?? []);
        if (activity.childElementCount === 0) {
          activity.remove();
        }
      }
      const contentElement = messageElement.createDiv(
        'windy-message__content',
      );
      const content = message.displayContent
        ?? (message.content || (message.role === 'assistant' ? '…' : ''));
      const isLiveAssistant = (
        message.role === 'assistant'
        && index === messages.length - 1
        && (
          status === 'running'
          || status === 'waiting-approval'
          || status === 'waiting-input'
          || status === 'interrupted'
        )
      );
      if (message.role === 'assistant' && !isLiveAssistant && message.content) {
        contentElement.addClass('markdown-rendered');
        markdownRenders.push(
          this.renderMarkdown(contentElement, content, sourcePath),
        );
      } else {
        contentElement.addClass('windy-message__content--plain');
        if (message.role === 'user') {
          this.renderPageMentions(
            contentElement,
            content,
            message.referencedPagePaths ?? [],
          );
        } else {
          contentElement.setText(content);
        }
      }
      if (message.role !== 'assistant') {
        this.renderThinking(messageElement, message);
        this.renderTools(messageElement, message.toolCalls ?? []);
      }
    }
    await Promise.all(markdownRenders);
  }

  private renderFileAttachments(
    messageElement: HTMLElement,
    message: ChatMessage,
  ): void {
    if (!message.attachments?.length) {
      return;
    }
    const container = messageElement.createDiv('windy-message__file-attachments');
    const vaultPath = getVaultPath(this.app);
    for (const attachment of message.attachments) {
      const resolvedPath = resolveFileAttachmentPath(attachment, vaultPath);
      const available = Boolean(resolvedPath && fs.existsSync(resolvedPath));
      const item = container.createDiv({
        cls: `windy-message__file${available ? '' : ' is-missing'}`,
      });
      const icon = item.createSpan('windy-message__file-icon');
      setIcon(icon, available ? attachmentIcon(attachment) : 'file-x');
      const labels = item.createSpan('windy-message__file-labels');
      labels.createSpan({
        cls: 'windy-message__file-name',
        text: attachment.name,
      });
      labels.createSpan({
        cls: 'windy-message__file-path',
        text: available
          ? `${attachmentTypeLabel(attachment)} · ${attachment.path} · ${formatFileSize(attachment.size)}`
          : `${attachmentTypeLabel(attachment)} · ${attachment.path} · File unavailable`,
      });
      item.setAttribute('title', attachment.path);
      item.setAttribute('aria-label', available
        ? `Attached file: ${attachment.path}`
        : `Attached file unavailable: ${attachment.path}`);
    }
  }

  private async renderMarkdown(
    container: HTMLElement,
    content: string,
    sourcePath: string,
  ): Promise<void> {
    try {
      await MarkdownRenderer.render(
        this.app,
        content,
        container,
        sourcePath,
        this,
      );
    } catch {
      container.empty();
      container.removeClass('markdown-rendered');
      container.addClass('windy-message__content--plain');
      container.setText(content);
    }
  }

  private renderReferences(
    messageElement: HTMLElement,
    message: ChatMessage,
  ): void {
    const attachedPaths = message.referencedPagePaths?.filter(
      path => !isInlinePageReference(message.content, path),
    ) ?? [];
    if (attachedPaths.length === 0) {
      return;
    }
    const references = messageElement.createDiv(
      'windy-message__references',
    );
    for (const path of attachedPaths) {
      references.createSpan({
        cls: 'windy-message__reference',
        text: path,
      });
    }
  }

  private renderPageMentions(
    container: HTMLElement,
    content: string,
    paths: string[],
  ): void {
    for (const segment of splitPageMentionText(content, paths)) {
      if (segment.type === 'text') {
        container.appendText(segment.text);
        continue;
      }
      const mention = container.createSpan({
        cls: 'windy-message__inline-reference',
        attr: {
          'aria-label': `Page: ${segment.path}`,
          title: segment.path,
        },
      });
      const icon = mention.createSpan(
        'windy-message__inline-reference-icon',
      );
      setIcon(icon, segment.path.endsWith('.base') ? 'database' : 'file-text');
      mention.createSpan({
        cls: 'windy-message__inline-reference-title',
        text: pageBasename(segment.path),
      });
    }
  }

  private renderThinking(
    messageElement: HTMLElement,
    message: ChatMessage,
  ): void {
    const thinking = message.contentBlocks
      ?.filter(block => block.type === 'thinking')
      .map(block => block.content)
      .join('\n\n');
    if (!thinking) {
      return;
    }
    const details = messageElement.createEl('details', {
      cls: 'windy-thinking',
    });
    details.createEl('summary', { text: 'Reasoning' });
    details.createEl('pre', { text: thinking });
  }

  private renderTools(
    messageElement: HTMLElement,
    toolCalls: ToolCallInfo[],
  ): void {
    if (toolCalls.length === 0) {
      return;
    }
    const tools = messageElement.createDiv('windy-message__tools');
    for (const toolCall of toolCalls) {
      this.renderTool(tools, toolCall);
    }
  }

  private renderTool(container: HTMLElement, toolCall: ToolCallInfo): void {
    const details = container.createEl('details', {
      cls: `windy-tool windy-tool--${toolCall.status}`,
    });
    details.open = (
      toolCall.isExpanded === true
      || toolCall.status === 'error'
      || toolCall.status === 'blocked'
    );
    const summary = details.createEl('summary', {
      cls: 'windy-tool__summary',
    });
    const icon = summary.createSpan('windy-tool__icon');
    setIcon(icon, toolStatusIcon(toolCall.status));
    summary.createSpan({
      cls: 'windy-tool__name',
      text: formatToolName(toolCall.name),
    });
    summary.createSpan({
      cls: 'windy-tool__status',
      text: toolStatusLabel(toolCall.status),
    });

    const body = details.createDiv('windy-tool__body');
    if (Object.keys(toolCall.input).length > 0) {
      this.renderPayload(body, 'Input', toolCall.input);
    }
    if (toolCall.result !== undefined) {
      this.renderPayload(body, 'Output', toolCall.result);
    }
    if (body.childElementCount === 0) {
      body.createDiv({
        cls: 'windy-tool__empty',
        text: 'No details available.',
      });
    }
  }

  private renderPayload(
    container: HTMLElement,
    label: string,
    value: unknown,
  ): void {
    const section = container.createDiv('windy-tool__section');
    section.createDiv({
      cls: 'windy-tool__label',
      text: label,
    });
    section.createEl('pre', {
      cls: 'windy-tool__payload',
      text: formatToolPayload(value),
    });
  }
}

function pageBasename(path: string): string {
  const filename = path.split('/').at(-1) ?? path;
  return filename.replace(/\.(?:md|base)$/i, '');
}
