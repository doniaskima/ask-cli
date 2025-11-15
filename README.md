# ask-cli

`ask` is a terminal assistant that generates shell commands from natural language prompts.

You describe what you want to do, `ask` returns an executable command (or a short explanation), with optional typewriter output, clipboard copy, and history.

> Example:  
> “how to list all files modified in the last 7 days” → `find . -type f -mtime -7`

---

## Features

- Generate concise shell commands from natural language
- Context-aware prompt (OS, shell, current directory, files, tools, git repo)
- Command history stored locally in `~/.ask-cli/history.json`
- API key stored locally in `~/.ask-cli/config.json`
- Clipboard support (copies the generated command automatically)
- Optional typewriter effect for output
- Silent mode (no spinner, no typewriter)
- LLM-agnostic: `callLLM()` is a single function you can wire to OpenAI, Gemini, etc.

---

## Status

The project is wired end-to-end as a CLI, with a stubbed `callLLM()` implementation.

You can already:

- run `ask "how to do X"`
- see the generated output
- view and manage history
- store an API key

To connect a real model, you only need to implement `callLLM()` in `src/index.ts`.

---

## Installation

### Prerequisites

- Node.js 18+ (runtime)
- Bun (for development workflow)
- A terminal environment (macOS, Linux, or WSL/PowerShell on Windows)

### Clone and install

```bash
git clone <your-repo-url> ask-cli
cd ask-cli
bun install
```
