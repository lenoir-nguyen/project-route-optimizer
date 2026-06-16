# Template Structure & First Steps

This folder is a starter skeleton. Copy it to begin a new project, then work through the
checklist below. Delete this file once the project is set up.

## What's in here

```
<project>/
├── CLAUDE.md            Always-loaded Claude guidance — fill ALL placeholders
├── README.md            Human-facing overview
├── .gitignore           Sensible defaults (.env, node_modules, .venv, ...)
├── .env.example         Env var contract — copy to .env locally
├── conversation.md      Append-only session memory (latest ~10–15 entries; see RULES.md §9)
│                          └ conversation-archive.md — older entries, created on first compaction
├── STRUCTURE.md         This file (delete after setup)
├── .claude/
│   └── skills/          Project-specific skills (auto-activate here, nowhere else)
└── docs/
    ├── ARCHITECTURE.md  Deep architecture (link from CLAUDE.md)
    ├── SETUP_GUIDE.md   Local setup instructions
    └── VERSIONS.md      Release notes
```

## First-steps checklist

- [ ] Rename the folder to the project name.
- [ ] Fill in `CLAUDE.md` — every `<…>` placeholder, especially **Critical Files by Task**
      and **Constraints**.
- [ ] Copy `.env.example` → `.env` and add real values (never commit `.env`).
- [ ] Write the first `docs/ARCHITECTURE.md` and `docs/SETUP_GUIDE.md`.
- [ ] Add any project-specific skills under `.claude/skills/<skill-name>/SKILL.md`.
- [ ] Date the first `conversation.md` entry (it's append-only from here on).
- [ ] `git init` and make the first commit.
- [ ] Register the project in `AI-Projects/CLAUDE.md` (Projects table).
- [ ] Delete this `STRUCTURE.md`.

## Conventions to follow

- Universal rules: `AI-Projects/guidelines/RULES.md`
- Language rules: `AI-Projects/rules/`
- How to work with Claude: `AI-Projects/docs/WORKING-WITH-CLAUDE.md`
