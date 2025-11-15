#!/usr/bin/env node
import { Command } from "commander";
import ora from "ora";
import clipboard from "clipboardy";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import "dotenv/config";

type HistoryItem = {
  timestamp: string;
  question: string;
  command: string;
};

type Config = {
  apiKey?: string;
};

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

/**
 * TODO: replace this with a real LLM call (OpenAI, Gemini, etc.)
 * For now it's a stub so you can test the CLI UX.
 */
async function callLLM(prompt: string, apiKey: string): Promise<string> {
  // Just some simple patterns for testing:
  if (/virtual environment/i.test(prompt)) {
    return "python -m venv env";
  }
  if (/last 7 days/i.test(prompt)) {
    return "find . -type f -mtime -7";
  }

  // Fallback: echo with a comment
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

    if (apiKey) {
      const cfg = loadConfig();
      cfg.apiKey = apiKey;
      saveConfig(cfg);
      console.log("API key updated.");
      return;
    }

    // 2) Show history
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
      cfg.apiKey || process.env.ASK_CLI_API_KEY;

    if (!effectiveApiKey) {
      console.error(
        "No API key configured. Use: ask --api-key YOUR_KEY or set ASK_CLI_API_KEY."
      );
      process.exit(1);
    }

    const spinner = !silent ? ora("Thinking...").start() : null;

    let cmd = "";
    try {
      cmd = await callLLM(question, effectiveApiKey);
      if (spinner) spinner.succeed("Done");
    } catch (err: any) {
      if (spinner) spinner.fail("LLM call failed");
      console.error(err?.message || String(err));
      process.exit(1);
    }

    const output = `> ${cmd}`;

    if (type && !silent) {
      await typewriter(output);
    } else {
      console.log(output);
    }

    try {
      await clipboard.write(cmd);
      if (!silent) console.log("(Copied to clipboard)");
    } catch {
      if (!silent) console.log("(Clipboard unavailable)");
    }

    const historyItems = loadHistory();
    historyItems.push({
      timestamp: new Date().toISOString(),
      question,
      command: cmd,
    });
    saveHistory(historyItems);
  });

program.parse(process.argv);
