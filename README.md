# Threadleaf

> A page-native agent for Obsidian.

Threadleaf is an experimental Obsidian agent that treats the page—not the chat tab—as the primary unit of work.

Open a note and the agent follows it. Reopen the agent and the most relevant conversation for that page returns. Mention other notes when needed, while the current page remains the stable primary context.

## Why Threadleaf

Most Obsidian agent plugins are chat-centric:

- the agent lives in a persistent sidebar;
- conversations are organized as tabs;
- switching notes does not switch the active conversation;
- users must manually keep note navigation and chat navigation in sync.

This creates friction precisely where an embedded agent should feel effortless.

Threadleaf starts from a different interaction model:

> The page is the workspace. The agent is a contextual companion to that page.

## Mission

Make agent-assisted work in Obsidian feel native, contextual, and nearly invisible.

Threadleaf should reduce the interaction cost of using an agent to one natural action: open the page you want to work on.

## Product goals

- Provide a floating agent entry point in the bottom-right corner of Obsidian.
- Automatically associate the current page with its most recently used conversation.
- Restore page-specific conversations when users return to a page.
- Allow multiple conversations per page without exposing chat-tab management as the primary workflow.
- Treat the current page as the primary context and `@` mentions as additional context.
- Keep background agent tasks running when users navigate to another page.
- Preserve drafts, streaming state, approvals, and notifications across page switches.
- Support Markdown notes first, then expand to Bases, Canvas, PDF, splits, and pop-out windows.
- Remain local-first and preserve Obsidian's file-based ownership model.

## Design principles

1. **Page-first** — pages are primary; conversations belong to pages.
2. **Context follows focus** — navigation should update the agent automatically.
3. **Progressive disclosure** — page conversations appear first; global history remains available but secondary.
4. **No forced tab management** — users should not manage a working set of chat tabs.
5. **Background-safe** — switching pages must not cancel active work.
6. **Local-first** — mappings, metadata, and user content stay under the user's control.
7. **Provider-neutral** — the interaction model should work across Claude, Codex, and other supported runtimes.

## Intended experience

1. Open an Obsidian page.
2. Click the floating Threadleaf button.
3. Threadleaf restores the latest conversation associated with that page, or presents a page-scoped new conversation.
4. Switch to another page; the agent follows automatically.
5. Use `@` to add other notes without changing the primary page.
6. Return later and continue from where that page's work stopped.

## Technical direction

Threadleaf intends to reuse the provider runtimes, tool rendering, approvals, conversation persistence, mentions, and inline-edit capabilities proven by [Claudian](https://github.com/YishenTu/claudian), while replacing its tab-centric chat shell with a page conversation router and page-agent index.

The initial implementation is expected to be a fork-based exploration rather than a thin wrapper around the released Claudian plugin.

See [Project Vision](docs/VISION.md) for the product boundary and architectural direction. A Chinese version is available at [项目愿景](docs/VISION.zh-CN.md).

## Status

Design and prototyping.

The first milestone will focus on macOS desktop, a single Obsidian vault, Markdown pages, and Codex/Claude-backed conversations.

## Naming

**Threadleaf** combines:

- **Thread** — an agent conversation and its evolving work;
- **Leaf** — an Obsidian workspace leaf and the page currently in focus.

Chinese name: **页脉**.

## License

License selection is pending.

Future use of Claudian source code will preserve its MIT license and required copyright notice.
