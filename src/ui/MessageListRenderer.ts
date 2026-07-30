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
import type { ConversationTaskStatus } from '../runtime/RuntimeCoordinator';
import {
  formatToolName,
  formatToolPayload,
  toolStatusIcon,
  toolStatusLabel,
} from './messageFormatting';

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
        cls: `threadleaf-message threadleaf-message--${message.role}`,
      });
      messageElement.createDiv({
        cls: 'threadleaf-message__role',
        text: message.role === 'user' ? 'You' : 'Threadleaf',
      });
      this.renderReferences(messageElement, message);
      const contentElement = messageElement.createDiv(
        'threadleaf-message__content',
      );
      const content = message.displayContent
        ?? (message.content || (message.role === 'assistant' ? '…' : ''));
      const isLiveAssistant = (
        message.role === 'assistant'
        && index === messages.length - 1
        && (
          status === 'running'
          || status === 'waiting-approval'
          || status === 'interrupted'
        )
      );
      if (message.role === 'assistant' && !isLiveAssistant && message.content) {
        contentElement.addClass('markdown-rendered');
        markdownRenders.push(
          this.renderMarkdown(contentElement, content, sourcePath),
        );
      } else {
        contentElement.addClass('threadleaf-message__content--plain');
        contentElement.setText(content);
      }
      this.renderThinking(messageElement, message);
      this.renderTools(messageElement, message.toolCalls ?? []);
    }
    await Promise.all(markdownRenders);
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
      container.addClass('threadleaf-message__content--plain');
      container.setText(content);
    }
  }

  private renderReferences(
    messageElement: HTMLElement,
    message: ChatMessage,
  ): void {
    if (!message.referencedPagePaths?.length) {
      return;
    }
    const references = messageElement.createDiv(
      'threadleaf-message__references',
    );
    for (const path of message.referencedPagePaths) {
      references.createSpan({
        cls: 'threadleaf-message__reference',
        text: path,
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
      cls: 'threadleaf-thinking',
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
    const tools = messageElement.createDiv('threadleaf-message__tools');
    for (const toolCall of toolCalls) {
      this.renderTool(tools, toolCall);
    }
  }

  private renderTool(container: HTMLElement, toolCall: ToolCallInfo): void {
    const details = container.createEl('details', {
      cls: `threadleaf-tool threadleaf-tool--${toolCall.status}`,
    });
    details.open = (
      toolCall.isExpanded === true
      || toolCall.status === 'error'
      || toolCall.status === 'blocked'
    );
    const summary = details.createEl('summary', {
      cls: 'threadleaf-tool__summary',
    });
    const icon = summary.createSpan('threadleaf-tool__icon');
    setIcon(icon, toolStatusIcon(toolCall.status));
    summary.createSpan({
      cls: 'threadleaf-tool__name',
      text: formatToolName(toolCall.name),
    });
    summary.createSpan({
      cls: 'threadleaf-tool__status',
      text: toolStatusLabel(toolCall.status),
    });

    const body = details.createDiv('threadleaf-tool__body');
    if (Object.keys(toolCall.input).length > 0) {
      this.renderPayload(body, 'Input', toolCall.input);
    }
    if (toolCall.result !== undefined) {
      this.renderPayload(body, 'Output', toolCall.result);
    }
    if (body.childElementCount === 0) {
      body.createDiv({
        cls: 'threadleaf-tool__empty',
        text: 'No details available.',
      });
    }
  }

  private renderPayload(
    container: HTMLElement,
    label: string,
    value: unknown,
  ): void {
    const section = container.createDiv('threadleaf-tool__section');
    section.createDiv({
      cls: 'threadleaf-tool__label',
      text: label,
    });
    section.createEl('pre', {
      cls: 'threadleaf-tool__payload',
      text: formatToolPayload(value),
    });
  }
}
