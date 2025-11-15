# ask-shell-assistant

`ask` is a small terminal assistant that generates shell commands from natural language.
It inspects your current environment (OS, shell, files, git repo) and asks an LLM
(OpenAI-compatible) to return precise, executable commands.

---

## Features

- Natural-language → shell command generation.
- Context-aware:
  - OS and shell
  - Current working directory
  - Visible files
  - Git status (branch + short status)
  - Optional project metadata from `.askrc.json`
- Two modes:
  - `ask "<question>"` → generate commands.
  - `ask explain "<command>"` → explain an existing command.
- Colored, readable output (uses `chalk`) with optional typewriter effect.
- History log stored locally in `~/.ask-cli/history.json`.
- Clipboard support (auto-copy generated command).
- Optional integration with [`cmdbook`](https://github.com/your-org/cmdbook) via `--save`.

---

## Requirements

- Node.js 20+ (or recent LTS).
- An OpenAI-compatible API key:
  - `OPENAI_API_KEY`, or
  - `ASK_CLI_API_KEY`
- Optional: `cmdbook` CLI on your `PATH` if you want to use `--save`.

---

## Installation

From the project root:

```bash
# install dependencies
bun install           # or: npm install / pnpm install / yarn install

# build (if you have a build step)
bun run build         # or your preferred build script

# link globally for local dev
bun link              # or: npm link


```

Now `ask` should be available on your PATH.

---

## Configuration

### API key

You can provide your API key in two ways:

1. Environment variable:

```bash
export OPENAI_API_KEY="sk-..."
# or
export ASK_CLI_API_KEY="sk-..."
```

2. Via the CLI:

```bash
ask --api-key sk-...
```

This writes to `~/.ask-cli/config.json`.

### Model

By default, `ask` uses:

```bash
ASK_MODEL=gpt-4.1-mini
```

You can override it with an environment variable:

```bash
export ASK_MODEL="gpt-4.1"
```

Any OpenAI-compatible chat model name should work.

---

## Usage

### Generate a command

```bash
ask "how to list all git branches"

# Example output
# =====================================
#   ask • terminal assistant for shell commands
# =====================================
# > git branch -a
# Copied to clipboard.
```

```bash
ask "how to create a Node.js project with TypeScript"
```

You can enable the typewriter effect:

```bash
ask --type "how to list files changed in the last 7 days"
```

Or get JSON output:

```bash
ask --json "how to find all .log files recursively"
```

### Explain a command

```bash
ask explain "find . -type f -mtime -7"
```

Use `--json` if you want a structured explanation:

```bash
ask explain --json "rm -rf dist"
```

### History

```bash
ask --history
```

This shows previous questions and answers from `~/.ask-cli/history.json`.

---

## CmdBook integration

If [`cmdbook`](https://github.com/your-org/cmdbook) is installed and available on `PATH`,
you can save generated commands directly:

```bash
ask --save "how to list all Docker images"
```

Internally this runs:

```bash
cmdbook add "<generated-command>" -d "<your question>" -t ask
```

If `cmdbook` is not installed, `ask` will print a warning and continue normally.

---

## Project-level config (`.askrc.json`)

You can add optional metadata per project in a `.askrc.json` file at the repository root.
This information is sent as context to the model.

Example:

```json
{
  "stack": "nodejs, nextjs, postgres",
  "packageManager": "pnpm",
  "tags": ["backend", "internal-tools"]
}
```

---

## Clipboard

By default, `ask` copies the generated command to the clipboard.

To disable this:

```bash
ask --no-clipboard "how to check open ports on this machine"
```

---

## Flags overview

- `--history` – show previous questions and answers.
- `--api-key <API_KEY>` – set or replace stored API key.
- `--silent` – hide spinner / progress messages.
- `--type` – typewriter effect for the formatted output.
- `--json` – emit machine-readable JSON.
- `--no-clipboard` – do not copy to clipboard.
- `--save` – save generated command into `cmdbook` (if available).
- `explain` subcommand – explain an existing command.

---

## License

This project is licensed under the MIT License. See `LICENSE` for details.
