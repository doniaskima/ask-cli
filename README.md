# ask-cli

`ask` is a small CLI assistant that turns natural language into shell commands.

You describe what you want to do; `ask` inspects your environment (OS, shell, cwd, git, tools, optional `.askrc.json`) and asks an LLM to generate a command (or a short explanation).

---

## Install (dev setup)

```bash
git clone <your-repo-url> ask-cli
cd ask-cli
bun install
bun run build
chmod +x dist/index.js
npm link
```

This makes the `ask` command available globally.

---

## Configuration

`ask` needs an API key for the model you plug into `callLLM()`.

You can set it via:

```bash
ask --api-key YOUR_API_KEY
```

This stores the key in:

- `~/.ask-cli/config.json`

Alternatively, use an env var:

- `ASK_CLI_API_KEY` or `GOOGLE_API_KEY`

History is stored in:

- `~/.ask-cli/history.json`

---

## Usage

### Generate a command

```bash
ask "how to list all files in current directory"
```

### Explain a command

```bash
ask explain "rm -rf build"
```

### Show history

```bash
ask --history
```

### JSON output

```bash
ask --json "how to create a python virtual environment"
```

### Save to CmdBook (if `cmdbook` CLI is installed)

```bash
ask --save "how to list all git branches"
```

---

## CLI options (main mode)

```bash
ask [options] [question...]
```

- `--silent` suppress spinner and typewriter
- `--type` typewriter-style output
- `--json` output JSON (command + explanation)
- `--no-clipboard` do not copy to clipboard
- `--save` save command to CmdBook (`cmdbook add ...`)
- `--history` show previous questions/answers
- `--api-key` set or replace API key

## Explain subcommand

```bash
ask explain "<command>" [--json]
```

Explains an existing command instead of generating a new one.

---

## Notes

- Model integration is isolated in `callLLM(prompt, apiKey)`.
  Replace the stub with your OpenAI / Gemini / other API call.
- Per-project hints can be provided via `.askrc.json` in the project root
  (for example stack, package manager, tags).
