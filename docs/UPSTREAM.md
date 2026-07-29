# Upstream source boundary

Threadleaf is an independent Obsidian plugin. It does not depend on Claudian,
embed Claudian as a module, reuse Claudian storage, or support Claudian data
migration.

Selected implementation code was copied once from:

- Project: [YishenTu/claudian](https://github.com/YishenTu/claudian)
- Version: `2.0.41`
- Commit: `a6ac2359b65a1a3695726347a7b1d281b18ab908`
- Snapshot date: 2026-07-29

## Imported boundary

The initial import contains 67 TypeScript files: the dependency closure rooted
at Claudian's provider-neutral `ChatRuntime`, shared chat types, and
`CodexChatRuntime`.

The imported implementation covers:

- provider-neutral turn and stream contracts;
- conversation and tool-call types;
- Codex app-server process and JSON-RPC transport;
- Codex notification and server-request routing;
- Codex session, model, skill, approval, and history helpers;
- filesystem, context, and image utilities required by the Codex runtime.

## Explicitly excluded

- Claudian's plugin entry point and lifecycle;
- sidebar and chat view;
- tab manager and tab bar;
- settings UI;
- storage implementation and `.claudian` data;
- conversation UI controllers and renderers;
- documentation, release scripts, and Git history;
- Claude, OpenCode, Pi, and Grok implementations.

Threadleaf may adapt additional provider implementations later, but each one
will be selected and integrated into Threadleaf's own architecture rather than
bringing in the Claudian application.
