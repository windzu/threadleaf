import type { ChatTurnRequest, PreparedChatTurn } from '../../../core/runtime/types';
import {
  appendContextFiles,
  appendCurrentNote,
} from '../../../utils/context';

function isCompactCommand(text: string): boolean {
  return /^\/compact(\s|$)/i.test(text);
}

function appendAttachedPageMentions(
  prompt: string,
  pagePaths: string[],
): string {
  const missingMentions = pagePaths.filter(
    path => !prompt.includes(`@${path}`),
  );
  if (missingMentions.length === 0) {
    return prompt;
  }
  return [
    prompt,
    '',
    'Use these explicitly attached pages as context for this request:',
    ...missingMentions.map(path => `@${path}`),
  ].join('\n');
}

export function encodeCodexTurn(request: ChatTurnRequest): PreparedChatTurn {
  const isCompact = isCompactCommand(request.text);

  if (isCompact) {
    return {
      request,
      persistedContent: request.text,
      prompt: request.text,
      isCompact: true,
      mcpMentions: new Set(),
    };
  }

  const referencedPagePaths = [...new Set(request.referencedPagePaths ?? [])]
    .filter(path => path && path !== request.primaryPagePath);
  const promptWithMentions = appendAttachedPageMentions(
    request.text,
    referencedPagePaths,
  );
  let pageContextPrompt = request.primaryPagePath
    ? appendCurrentNote(promptWithMentions, request.primaryPagePath)
    : promptWithMentions;
  if (referencedPagePaths.length > 0) {
    pageContextPrompt = appendContextFiles(
      pageContextPrompt,
      referencedPagePaths,
    );
  }
  const sections: string[] = [pageContextPrompt];

  if (request.editorSelection?.selectedText) {
    sections.push(
      `\n[Editor selection from ${request.editorSelection.notePath || 'current note'}:\n${request.editorSelection.selectedText}\n]`,
    );
  }

  if (request.browserSelection?.selectedText) {
    sections.push(
      `\n[Browser selection from ${request.browserSelection.url ?? 'unknown page'}:\n${request.browserSelection.selectedText}\n]`,
    );
  }

  if (request.canvasSelection) {
    const nodeList = request.canvasSelection.nodeIds.join(', ');
    if (nodeList) {
      sections.push(
        `\n[Canvas selection from ${request.canvasSelection.canvasPath}:\n${nodeList}\n]`,
      );
    }
  }

  const prompt = sections.join('');

  return {
    request,
    persistedContent: request.text,
    prompt,
    isCompact: false,
    mcpMentions: new Set(),
  };
}
