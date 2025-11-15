#!/usr/bin/env node
import { Command } from "commander";
import ora from "ora";
import clipboard from "clipboardy";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import "dotenv/config";

// ----------------------------
// Types
// ----------------------------

type AskHistoryEntry = {
  timestamp: string;
  question: string;
  answer: string;
};

type AskConfig = {
  apiKey?: string;
};

// ----------------------------
// Error types
// ----------------------------

class AskError extends Error {}
class AskAuthError extends AskError {}
class AskContentError extends AskError {}
class AskTimeoutError extends AskError {}

// ----------------------------
// Paths / constants
// ----------------------------

const HOME_DIR = os.homedir();
const ASK_DIR = path.join(HOME_DIR, ".ask-cli");
const HISTORY_PATH = path.join(ASK_DIR, "history.json");
const CONFIG_PATH = path.join(ASK_DIR, "config.json");

// ----------------------------
// Storage helpers
// ----------------------------

function ensureStorageDir(): void {
  if (!fs.existsSync(ASK_DIR)) {
    fs.mkdirSync(ASK_DIR, { recursive: true });
  }
}

function readConfig(): AskConfig {
  ensureStorageDir();
  if (!fs.existsSync(CONFIG_PATH)) return {};
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    // corrupt config – ignore and start fresh
    return {};
  }
}

function writeConfig(cfg: AskConfig): void {
  ensureStorageDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

function readHistory(): AskHistoryEntry[] {
  ensureStorageDir();
  if (!fs.existsSync(HISTORY_PATH)) return [];
  const raw = fs.readFileSync(HISTORY_PATH, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function appendHistory(entry: AskHistoryEntry): void {
  const list = readHistory();
  list.push(entry);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(list, null, 2), "utf8");
}

// ----------------------------
// UI helpers
// ----------------------------

function header(): void {
  console.log("=====================================");
  console.log("  ask - terminal assistant for shell commands");
  console.log("=====================================\n");
}

/**
 * Remove code fences / wrapping backticks if the model returns them.
 */
function stripCodeFences(text: string): string {
  let t = text.trim();

  // ```bash ... ``` or ```...```
  if (t.startsWith("```") && t.endsWith("```")) {
    const firstNewline = t.indexOf("\n");
    if (firstNewline !== -1) {
      t = t.slice(firstNewline + 1, t.length - 3).trim();
    } else {
      t = t.replace(/```/g, "").trim();
    }
  }

  // `single-line`
  if (t.startsWith("`") && t.endsWith("`") && t.length > 2) {
    t = t.slice(1, -1).trim();
  }

  return t;
}

// ----------------------------
// Environment inspection
// ----------------------------

function commandInPath(bin: string): boolean {
  const whichCmd = process.platform === "win32" ? "where" : "which";
  try {
    const res = spawnSync(whichCmd, [bin], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

function detectTools(): string {
  const candidates = [
    "git",
    "npm",
    "node",
    "pnpm",
    "yarn",
    "python",
    "pip",
    "docker",
    "go",
    "ruby",
    "java",
  ];
  const found: string[] = [];

  for (const name of candidates) {
    if (commandInPath(name)) found.push(name);
  }

  return found.join(", ");
}

function detectShell(): string {
  // On Windows COMSPEC usually points to cmd.exe or powershell
  return process.env.SHELL || process.env.COMSPEC || "unknown";
}

function summarizeFiles(cwd: string): string {
  try {
    const entries = fs.readdirSync(cwd);
    const visible = entries.filter((f) => !f.startsWith("."));
    const top = visible.slice(0, 20);
    return top.join(", ") + (visible.length > 20 ? ", ..." : "");
  } catch {
    return "unavailable";
  }
}

// ----------------------------
// Prompt construction
// ----------------------------

function buildPrompt(question: string): string {
  const cwd = process.cwd();
  const user = os.userInfo().username;
  const platform = `${os.platform()} ${os.release()}`;
  const isGitRepo = fs.existsSync(path.join(cwd, ".git")) ? "yes" : "no";
  const tools = detectTools();
  const shell = detectShell();
  const files = summarizeFiles(cwd);

  return [
    "You are Ask, a CLI helper that returns shell commands or very short explanations.",
    "",
    "Environment:",
    `- platform: ${platform}`,
    `- shell: ${shell}`,
    `- user: ${user}`,
    `- cwd: ${cwd}`,
    `- git_repo: ${isGitRepo}`,
    `- files_sample: ${files}`,
    `- tools_available: ${tools || "none detected"}`,
    "",
    "Guidelines:",
    "1) Prefer a single concise command. If multiple steps are really necessary, put each command on its own line.",
    '2) Do not add introductions like "Here is the command"; output only commands or a one-line explanation.',
    "3) If a command is potentially destructive (rm, find -delete, mass changes), add a single comment line after it starting with '# explain:'.",
    '4) If the user asks a conceptual question (for example: "what is ls"), return a one-sentence answer instead of a command.',
    "5) If the request is ambiguous, respond with a single clarifying question starting with '# clarify:'.",
    "",
    "User request:",
    question,
    "",
    "Answer:",
  ].join("\n");
}

// ----------------------------
// LLM integration (stub)
// ----------------------------

/**
 * Stub implementation.
 * Replace this with a real LLM call (OpenAI, Gemini, etc.).
 */
async function callLLM(prompt: string, apiKey: string): Promise<string> {
  // simple heuristics to make local testing nicer
  if (/virtual environment/i.test(prompt)) {
    return "python -m venv env";
  }

  if (/last 7 days/i.test(prompt)) {
    return "find . -type f -mtime -7";
  }

  if (/list files/i.test(prompt)) {
    return "ls -la";
  }

  return 'echo "[ask-cli] replace callLLM() with a real API call"';
}

// ----------------------------
// Small utilities
// ----------------------------

function printHistory(): void {
  const entries = readHistory();
  if (!entries.length) {
    console.log("No history yet.");
    return;
  }

  for (const item of entries) {
    console.log(`[${item.timestamp}]`);
    console.log(`Q: ${item.question}`);
    console.log(`> ${item.answer}`);
    console.log("");
  }
}

// ----------------------------
// CLI wiring
// ----------------------------

const program = new Command();

program
  .name("ask")
  .description("ask: terminal assistant that generates shell commands")
  .argument("[question...]", "What you want to do (natural language)")
  .option("--silent", "Suppress spinner and typewriter", false)
  .option("--type", "Show output with typewriter effect", false)
  .option("--history", "Show previous questions and commands", false)
  .option("--api-key <API_KEY>", "Set or replace your LLM API key")
  .action(async (questionParts: string[], options: any) => {
    const { silent, type, history, apiKey } = options;

    header();

    // 1) API key management
    if (apiKey) {
      const cfg = readConfig();
      cfg.apiKey = apiKey;
      writeConfig(cfg);
      console.log("API key updated.");
      return;
    }

    // 2) History display
    if (history) {
      printHistory();
      return;
    }

    // 3) Normal flow
    const question = questionParts.join(" ").trim();
    if (!question) {
      program.outputHelp();
      process.exit(0);
    }

    const cfg = readConfig();
    const effectiveApiKey: string | undefined =
      cfg.apiKey || process.env.ASK_CLI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!effectiveApiKey) {
      console.error(
        "No API key configured. Use: ask --api-key YOUR_KEY or set ASK_CLI_API_KEY / GOOGLE_API_KEY."
      );
      process.exit(1);
    }

    const spinner = !silent ? ora("Generating...").start() : null;

    let rawText = "";
    try {
      const prompt = buildPrompt(question);
      rawText = await callLLM(prompt, effectiveApiKey);
      if (spinner) spinner.succeed("Done");
    } catch (err: any) {
      if (spinner) spinner.fail("LLM call failed");
      console.error(err?.message || String(err));
      process.exit(1);
    }

    const stripped = stripCodeFences(rawText);
    if (!stripped.trim()) {
      console.error("Model returned empty output.");
      process.exit(1);
    }

    const lines = stripped.split("\n");
    const formatted = lines
      .map((line, index) => (index === 0 ? `> ${line}` : `  ${line}`))
      .join("\n");

    if (type && !silent) {
      await typewriter(formatted);
    } else {
      console.log(formatted);
    }

    // copy plain content (no "> " prefix)
    try {
      await clipboard.write(stripped);
      if (!silent) console.log("Copied to clipboard.");
    } catch {
      if (!silent) console.log("Clipboard unavailable.");
    }

    appendHistory({
      timestamp: new Date().toISOString(),
      question,
      answer: stripped,
    });
  });

program.parse(process.argv);

// ----------------------------
// Typewriter effect
// ----------------------------

function typewriter(text: string, delayMs = 15): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    const interval = setInterval(() => {
      process.stdout.write(text[i]);
      i++;
      if (i >= text.length) {
        clearInterval(interval);
        process.stdout.write("\n");
        resolve();
      }
    }, delayMs);
  });
}
