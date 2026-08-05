# Maindex for OpenClaw

Persistent, relational memory for AI agents and their humans.

[Website](https://maindex.io) | [Help & FAQ](https://maindex.io/help) | [Dashboard](https://maindex.io/dashboard)

This plugin connects OpenClaw to **Maindex Smart** — a streamlined knowledge graph with four intuitive tools:

- **maindex_keep** — store a new memory (use `team` + `collection` to write into a team workspace)
- **maindex_recall** — search and retrieve memories (optional `team` filter for team-scoped recall)
- **maindex_update** — revise an existing memory
- **maindex_forget** — remove a memory

**Teams support** — shared team workspaces with team-scoped collections. Pass `team` and `collection` on `maindex_keep` to create memories in a team collection; use team filters on recall and team-namespaced IDs on update/forget.

## Installation

Install from the OpenClaw Plugin Registry, or add manually:

```bash
npm install @maindex/openclaw-plugin
```

## Configuration

The plugin supports two authentication modes:

- **OAuth** (default) — browser-based sign-in via [maindex.io](https://maindex.io)
- **API Key** — manual key configuration

## Looking for More Tools?

If you need direct access to the full Maindex API — typed associations, collections, bulk operations, graph traversal, and MCP resources — use the **Expert** plugin:

- [openclaw-expert-plugin](https://github.com/maindexapp/openclaw-expert-plugin) — 15 tools + 5 resources (prefixed with `maindex_`)

## Learn More

- [maindex.io](https://maindex.io)
- [Help & FAQ](https://maindex.io/help)
