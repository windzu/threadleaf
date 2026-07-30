# Threadleaf architecture

Threadleaf separates page navigation, persisted conversations, task
coordination, and provider execution so page changes never own or cancel agent
work.

## Runtime ownership

```mermaid
flowchart TB
    Plugin["Threadleaf plugin"] --> Gateway["CodexAppServerGateway"]
    Plugin --> Coordinator["RuntimeCoordinator"]
    Coordinator --> TaskA["ConversationTaskController A"]
    Coordinator --> TaskB["ConversationTaskController B"]
    TaskA --> CheckpointA["TurnCheckpointManager A"]
    TaskB --> CheckpointB["TurnCheckpointManager B"]
    TaskA --> RuntimeA["Conversation runtime A"]
    TaskB --> RuntimeB["Conversation runtime B"]
    RuntimeA --> Gateway
    RuntimeB --> Gateway
    Gateway --> Process["One Codex app-server process"]
    Process --> ThreadA["Codex thread A"]
    Process --> ThreadB["Codex thread B"]
```

The plugin owns one `CodexAppServerGateway` for the lifetime of the Vault
plugin instance. The gateway owns the child process, RPC transport, launch
configuration, and process generation.

Each conversation owns a lightweight `CodexChatRuntime`. It retains
conversation-specific thread, turn, prompt, approval, and stream state, but
does not own a child process.

`RuntimeCoordinator` is only the registry and aggregate activity boundary. A
per-conversation `ConversationTaskController` owns send, cancel, approval, and
recovery state. Its `TurnCheckpointManager` owns partial-output persistence and
interruption checkpoints. Concurrent requests to initialize the same
conversation share one controller and one runtime.

The gateway broadcasts notifications to active conversation runtimes. Each
runtime accepts only notifications matching its current `threadId` and
`turnId`. Server-initiated requests are dispatched to exactly one runtime by
`threadId`.

## Lifecycle invariants

- Persisted conversation count does not determine child-process count.
- Page navigation changes the visible route but does not dispose a running
  conversation runtime.
- Plugin unload first cancels conversation work, then shuts down the shared
  gateway.
- A gateway restart increments its generation. Every conversation runtime
  observes that generation and resumes its persisted Codex thread in the new
  app-server process before starting another turn.
- Conversation runtime cleanup removes its gateway subscriptions without
  shutting down the shared process.

## Storage invariants

- Conversation files use a versioned envelope under
  `.threadleaf/conversations/<id>.json`. Legacy unversioned Threadleaf files are
  read without modification, version 1 envelopes remain readable, and both are
  upgraded to the current schema on their next normal save.
- Existing JSON files are updated through Obsidian's atomic `process` API. New
  files are written to a unique sibling temporary file and renamed into place.
- Startup reconciliation removes page-index references only when the referenced
  conversation file is definitely missing. Read failures and unreferenced
  conversation files are preserved for recovery instead of being deleted.
- A non-terminal turn persists its user and assistant message ids, source page,
  status, and timestamps. On plugin restart, `running` and `waiting-approval`
  states become `interrupted`; partial assistant output remains visible and the
  lost live turn is never presented as still running.

## Current boundaries

- `src/page-context`: active page detection and page-to-conversation routing.
- `src/page-context/PageConversationService`: page-scoped history summaries,
  lazy first-send creation, and conversation selection.
- `src/conversations`: persisted conversation content and provider session
  metadata.
- `src/runtime/RuntimeCoordinator`: task registry, event forwarding, and global
  background status.
- `src/runtime/ConversationTaskController`: one conversation's live task
  lifecycle.
- `src/runtime/TurnCheckpointManager`: partial turn persistence and interruption
  recovery.
- `src/providers/codex/runtime`: Codex protocol, shared process gateway, and
  per-conversation runtime state.
- `src/ui`: Obsidian presentation and user interaction.

Future storage and UI work should preserve these ownership boundaries.
