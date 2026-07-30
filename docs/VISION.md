# Windy Project Vision

## Background

Obsidian is page-oriented: users move through notes, Bases, Canvas documents, PDFs, and linked knowledge by changing the active workspace leaf.

Most embedded agents use a different model. They present a persistent chat sidebar containing a small set of open conversation tabs. The note and the conversation are separate navigation systems. When users switch notes, they must also find and switch the matching conversation.

This mismatch creates four recurring problems:

1. **Double navigation** — users switch both the page and the conversation.
2. **Context ambiguity** — the visible page may not match the agent's active context.
3. **Poor retrieval** — conversation titles describe tasks but do not reliably identify their owning page.
4. **Artificial limits** — open-tab limits force users to manage a working set that should be resolved automatically.

Notion demonstrates a more natural model: the agent opens in the context of the current page, page changes update the default context, page-specific work can be resumed, and other pages can be added explicitly.

Windy brings this page-native interaction model to Obsidian.

## Mission

Windy makes the current Obsidian page the natural home of an agent conversation.

The product succeeds when users no longer think about selecting the correct agent tab. They navigate to a page, open the agent, and continue the work associated with that page.

## Core product model

### Primary resource

Every page-scoped conversation has one primary resource:

- a Markdown note;
- later, a Base, Canvas, PDF, or another supported Obsidian view.

The primary resource determines which page owns the conversation.

### Additional resources

Files added through `@` mentions or explicit attachments provide additional context. They do not change conversation ownership.

### Page conversation state

A page may own multiple conversations, but it always has a most recently used conversation. Opening Windy resolves to:

1. the page's most recently used conversation;
2. otherwise, a page-scoped blank conversation.

### Global history

Global conversation history remains available for discovery and recovery. It is secondary to page-scoped history and is not the main navigation surface.

## Target interaction

### Agent closed

- A floating entry point appears in the bottom-right corner.
- It reflects relevant background states such as running, completed, or awaiting approval.
- No conversation runtime needs to be hydrated merely because a page is visible.

### Agent opened

- The native Obsidian right-side workspace view is revealed.
- Windy resolves the active content page.
- The page's last conversation or blank page-scoped draft is shown.
- The current page appears as the stable primary-context chip.

### Page switched

- The outgoing draft is saved.
- The incoming page's conversation is resolved.
- Background work on the previous page continues.
- Stale asynchronous loads cannot replace the newly selected page.

### New conversation

- A new conversation is created under the current page.
- It becomes that page's most recently used conversation.
- Previous page conversations remain available from page-local history.

## Goals

### G1 — Page-native routing

Resolve the correct agent state automatically from the current Obsidian content leaf.

### G2 — Conversation continuity

Restore the last relevant conversation, draft, streaming state, and page ownership reliably.

### G3 — Background execution

Allow tasks to continue while users navigate elsewhere, with clear completion and approval signals.

### G4 — Provider reuse

Reuse mature provider runtime capabilities instead of reimplementing Claude, Codex, tool-call, permission, and history protocols.

### G5 — Local-first ownership

Keep page-conversation mappings and metadata in the vault or another user-controlled local store.

### G6 — Obsidian-native behavior

Respect workspace leaves, sidebars, themes, keyboard navigation, file renames, splits, and pop-out windows.

## Non-goals for the first release

- Perfect support for every Obsidian view type.
- Mobile support.
- Real-time collaborative conversations.
- Cloud accounts or hosted conversation storage.
- Recreating Notion's visual design pixel for pixel.
- Reimplementing provider-native agent runtimes.
- Supporting unlimited simultaneously active runtimes.

## Implementation direction

Windy is a new Obsidian plugin, not a Claudian fork or wrapper. The
initial codebase copies and adapts a fixed snapshot of:

- provider-neutral runtime contracts;
- the Codex provider adapter;
- streaming and approval protocols;
- the supporting conversation and tool-call types.

It deliberately excludes Claudian's plugin shell, tabs, views, settings UI,
storage implementation, and conversation UI. Windy owns its page-native
interaction model, storage schema, lifecycle, and user interface from the
start.

The replacement interaction layer should introduce:

- `PageContextResolver`;
- `PageConversationRouter`;
- `PageAgentIndex`;
- `RuntimeCoordinator`;
- per-page draft persistence;
- floating-entry state.

## Initial scope

The first usable release should support:

- macOS desktop;
- one Obsidian vault;
- Markdown and Bases pages;
- one main window;
- a floating bottom-right entry point;
- a native right-sidebar Agent view;
- page-specific new and existing conversations;
- page-local and global history;
- `@` mentions;
- Claude and Codex providers;
- background streaming across page switches.

## Success criteria

Windy reaches its first product milestone when:

- opening the agent on a page always shows the expected page conversation;
- switching between two pages requires no manual conversation switching;
- switching pages does not cancel an active task;
- drafts survive repeated navigation;
- renaming a page preserves its conversation association;
- page context and additional `@` context remain visually and semantically distinct;
- users can complete daily work without interacting with a chat-tab bar.

## Long-term direction

Windy can evolve from a page-bound chat interface into a page-native work layer:

- page-aware suggested actions;
- page-type-specific commands for Markdown, Bases, Canvas, and PDF;
- background task center;
- page-level conversation summaries;
- durable relationships between pages, tasks, and agent outcomes;
- optional cross-device synchronization using user-owned storage.

The long-term differentiator is not access to a particular model. It is the interaction contract:

> The agent always understands where the user is working and returns to the work that belongs there.
