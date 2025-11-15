#!/usr/bin/env node
import { Command } from "commander";
import ora from "ora";
import clipboard from "clipboardy";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import "dotenv/config";

type HistoryItem = {
  timestamp: string;
  question: string;
  command: string;
};

type Config = {
  apiKey?: string;
};

class ApiError extends Error {}
class AuthError extends ApiError {}
class ContentError extends ApiError {}
class ApiTimeoutError extends ApiError {}

const CONFIG_DIR = path.join(os.homedir(), ".ask-cli");
const HISTORY_FILE = path.join(CONFIG_DIR, "history.json");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig(): Config {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) return {};
  const raw = fs.readFileSync(CONFIG_FILE, "utf8");
  return JSON.parse(raw);
}

function saveConfig(cfg: Config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

function loadHistory(): HistoryItem[] {
  ensureConfigDir();
  if (!fs.existsSync(HISTORY_FILE)) return [];
  const raw = fs.readFileSync(HISTORY_FILE, "utf8");
  return JSON.parse(raw);
}

function saveHistory(items: HistoryItem[]) {
  ensureConfigDir();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(items, null, 2), "utf8");
}

function header() {
  console.log("=====================================");
  console.log("  ask - terminal assistant for shell commands");
  console.log("=====================================\n");
}

function cleanResponse(text: string): string {
  let t = text.trim();

  if (t.startsWith("```") && t.endsWith("```")) {
    const firstLineEnd = t.indexOf("\n");
    if (firstLineEnd !== -1) {
      const rest = t.slice(firstLineEnd + 1, t.length - 3);
      t = rest.trim();
    } else {
      t = t.replace(/```/g, "").trim();
    }
  } else if (t.startsWith("`") && t.endsWith("`")) {
    t = t.slice(1, -1).trim();
  }

  return t.trim();
}

function isToolAvailable(cmd: string): boolean {
  const whichCmd = process.platform === "win32" ? "where" : "which";
  try {
    const res = spawnSync(whichCmd, [cmd], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

function getInstalledTools(): string {
  const candidates = [
    "git",
    "npm",
    "node",
    "python",
    "docker",
    "pip",
    "go",
    "rustc",
    "cargo",
    "java",
    "mvn",
    "gradle",
  ];
  const found: string[] = [];
  for (const t of candidates) {
    if (isToolAvailable(t)) {
      found.push(t);
    }
  }
  return found.join(", ");
}

function getShell(): string {
  return process.env.SHELL || process.env.COMSPEC || "Unknown";
}

function getFilesSummary(cwd: string): string {
  try {
    const files = fs.readdirSync(cwd);
    const top = files.slice(0, 20);
    return top.join(", ") + (files.length > 20 ? "..." : "");
  } catch {
    return "Error listing files";
  }
}

function buildPrompt(question: string): string {
  const cwd = process.cwd();
  const user = os.userInfo().username;
  const osName = `${os.platform()} ${os.release()}`;
  const gitRepo = fs.existsSync(path.join(cwd, ".git")) ? "Yes" : "No";
  const tools = getInstalledTools();
  const shell = getShell();
  const files = getFilesSummary(cwd);

  return `SYSTEM:
You are an expert, concise shell assistant. Your goal is to provide accurate, executable shell commands.

CONTEXT:
- OS: ${osName}
- Shell: ${shell}
- CWD: ${cwd}
- User: ${user}
- Git Repo: ${gitRepo}
- Files (top 20): ${files}
- Available Tools: ${tools}

RULES:
1. Primary Goal: Generate only the exact, executable shell command(s) for the ${shell} environment.
2. Context is Key: Use the CONTEXT (CWD, Files, OS) to write specific, correct commands.
3. No Banter: Do not include greetings, sign-offs, or conversational filler (for example: "Here is the command:").
4. Safety: If a command is complex or destructive (for example: rm -rf, find -delete), add a single-line comment (# ...) after the command explaining what it does.
5. Questions: If the user asks a question (for example: "what is ls?"), provide a concise, one-line answer. Do not output a command.
6. Ambiguity: If the request is unclear, ask a single, direct clarifying question. Start the line with #.

REQUEST:
${question}

RESPONSE:
`;
}

/**
 * Stub LLM call.
 * Replace this with a real integration (OpenAI, Gemini, etc.).
 */
async function callLLM(prompt: string, apiKey: string): Promise<string> {
  if (/virtual environment/i.test(prompt)) {
    return "python -m venv env";
  }
  if (/last 7 days/i.test(prompt)) {
    return "find . -type f -mtime -7";
  }

  return 'echo "[ask-cli stub] Replace callLLM() with real LLM API call"';
}

function typewriter(text: string, delayMs = 15): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    const timer = setInterval(() => {
      process.stdout.write(text[i]);
      i++;
      if (i >= text.length) {
        clearInterval(timer);
        process.stdout.write("\n");
        resolve();
      }
    }, delayMs);
  });
}

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

    if (apiKey) {
      const cfg = loadConfig();
      cfg.apiKey = apiKey;
      saveConfig(cfg);
      console.log("API key updated.");
      return;
    }

    if (history) {
      const items = loadHistory();
      if (!items.length) {
        console.log("No history yet.");
        return;
      }

      for (const item of items) {
        console.log(`[${item.timestamp}]`);
        console.log(`Q: ${item.question}`);
        console.log(`> ${item.command}`);
        console.log("");
      }
      return;
    }

    const question = questionParts.join(" ").trim();
    if (!question) {
      program.outputHelp();
      process.exit(0);
    }

    const cfg = loadConfig();
    const effectiveApiKey: string | undefined =
      cfg.apiKey || process.env.ASK_CLI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!effectiveApiKey) {
      console.error(
        "No API key configured. Use: ask --api-key YOUR_KEY or set ASK_CLI_API_KEY or GOOGLE_API_KEY."
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

    const cleaned = cleanResponse(rawText);
    if (!cleaned.trim()) {
      console.error("Warning: model returned empty output.");
      process.exit(1);
    }

    const lines = cleaned.split("\n");
    const formatted = lines
      .map((line, idx) => (idx === 0 ? `> ${line}` : `  ${line}`))
      .join("\n");

    if (type && !silent) {
      await typewriter(formatted);
    } else {
      console.log(formatted);
    }

    try {
      await clipboard.write(cleaned);
      if (!silent) console.log("Copied to clipboard.");
    } catch {
      if (!silent) console.log("Clipboard unavailable.");
    }

    const historyItems = loadHistory();
    historyItems.push({
      timestamp: new Date().toISOString(),
      question,
      command: cleaned,
    });
    saveHistory(historyItems);
  });

program.parse(process.argv);
