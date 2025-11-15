#!/usr/bin/env node
import { Command } from "commander";
import ora from "ora";
import clipboard from "clipboardy";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import "dotenv/config";
import OpenAI from "openai";
import chalk from "chalk";

// ----------------------------
// Types
// ----------------------------

type AskMode = "generate" | "explain";

type AskHistoryEntry = {
  timestamp: string;
  mode: AskMode;
  question: string;
  answer: string;
};

type AskConfig = {
  apiKey?: string;
};

type AskProjectConfig = {
  stack?: string;
  packageManager?: string;
  tags?: string[];
};

// ----------------------------
// Error types
// ----------------------------

class AskError extends Error {}
class AskAuthError extends AskError {}
class AskContentError extends AskError {}
class AskTimeoutError extends AskError {}

// ----------------------------
// Theme
// ----------------------------

const theme = {
  border: (s: string) => chalk.gray(s),
  title: (s: string) => chalk.cyanBright.bold(s),
  subtitle: (s: string) => chalk.gray(s),
  label: (s: string) => chalk.blueBright(s),
  accent: (s: string) => chalk.magentaBright(s),
  success: (s: string) => chalk.greenBright(s),
  warning: (s: string) => chalk.yellowBright(s),
  error: (s: string) => chalk.redBright(s),
  dim: (s: string) => chalk.dim(s),
};

// ----------------------------
// Paths / constants
// ----------------------------

const HOME_DIR = os.homedir();
const ASK_DIR = path.join(HOME_DIR, ".ask-cli");
const HISTORY_PATH = path.join(ASK_DIR, "history.json");
const CONFIG_PATH = path.join(ASK_DIR, "config.json");
const PROJECT_RC = ".askrc.json";

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
// Project config
// ----------------------------

function readProjectConfig(cwd: string): AskProjectConfig | null {
  const rcPath = path.join(cwd, PROJECT_RC);
  if (!fs.existsSync(rcPath)) return null;
  try {
    const raw = fs.readFileSync(rcPath, "utf8");
    return JSON.parse(raw) as AskProjectConfig;
  } catch {
    return null;
  }
}

// ----------------------------
// UI helpers
// ----------------------------

function header(): void {
  const line = "=====================================";
  console.log(theme.border(line));
  console.log(
    "  " +
      theme.title("ask") +
      " " +
      theme.subtitle("• terminal assistant for shell commands")
  );
  console.log(theme.border(line) + "\n");
}

/**
 * Remove code fences / wrapping backticks if the model returns them.
 */
function stripCodeFences(text: string): string {
  let t = text.trim();

  if (t.startsWith("```") && t.endsWith("```")) {
    const firstNewline = t.indexOf("\n");
    if (firstNewline !== -1) {
      t = t.slice(firstNewline + 1, t.length - 3).trim();
    } else {
      t = t.replace(/```/g, "").trim();
    }
  }

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
    "pnpm",
    "yarn",
    "bun",
    "node",
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

type GitContext = {
  isRepo: boolean;
  branch?: string;
  summary?: string;
};

function detectGitContext(cwd: string): GitContext {
  const gitDir = path.join(cwd, ".git");
  if (!fs.existsSync(gitDir)) {
    return { isRepo: false };
  }

  let branch: string | undefined;
  let summary: string | undefined;

  try {
    const b = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
    });
    if (b.status === 0) {
      branch = b.stdout.trim();
    }
  } catch {
    // ignore
  }

  try {
    const s = spawnSync("git", ["status", "--short"], {
      cwd,
      encoding: "utf8",
    });
    if (s.status === 0) {
      const lines = s.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      summary = lines.slice(0, 5).join(" | ");
    }
  } catch {
    // ignore
  }

  return {
    isRepo: true,
    branch,
    summary,
  };
}

// ----------------------------
// Prompt construction
// ----------------------------

function buildGeneratePrompt(question: string): string {
  const cwd = process.cwd();
  const user = os.userInfo().username;
  const platform = `${os.platform()} ${os.release()}`;
  const tools = detectTools();
  const shell = detectShell();
  const files = summarizeFiles(cwd);
  const git = detectGitContext(cwd);
  const projectCfg = readProjectConfig(cwd);

  const lines: string[] = [];

  lines.push(
    "You are Ask, a CLI helper that returns shell commands or very short explanations."
  );
  lines.push("");
  lines.push("Environment:");
  lines.push(`- platform: ${platform}`);
  lines.push(`- shell: ${shell}`);
  lines.push(`- user: ${user}`);
  lines.push(`- cwd: ${cwd}`);
  lines.push(`- tools_available: ${tools || "none detected"}`);
  lines.push(`- files_sample: ${files}`);
  if (git.isRepo) {
    lines.push(`- git_repo: yes`);
    if (git.branch) lines.push(`- git_branch: ${git.branch}`);
    if (git.summary) lines.push(`- git_status_short: ${git.summary}`);
  } else {
    lines.push(`- git_repo: no`);
  }

  if (projectCfg) {
    lines.push("- project_config:");
    if (projectCfg.stack) lines.push(`  - stack: ${projectCfg.stack}`);
    if (projectCfg.packageManager)
      lines.push(`  - package_manager: ${projectCfg.packageManager}`);
    if (projectCfg.tags && projectCfg.tags.length) {
      lines.push(`  - tags: ${projectCfg.tags.join(", ")}`);
    }
  }

  lines.push("");
  lines.push("Guidelines:");
  lines.push(
    "1) Prefer a single concise command. If multiple steps are needed, put each command on its own line."
  );
  lines.push(
    '2) Do not add text like "Here is the command"; output only commands or a one-line explanation.'
  );
  lines.push(
    "3) If a command is potentially destructive (rm, find -delete, mass modification), add a single comment line after it starting with '# explain:'."
  );
  lines.push(
    '4) If the user asks a conceptual question (for example: "what is ls"), return a one-sentence answer instead of a command.'
  );
  lines.push(
    "5) If the request is ambiguous, respond with a single clarifying question line starting with '# clarify:'."
  );
  lines.push("");
  lines.push("User request:");
  lines.push(question);
  lines.push("");
  lines.push("Answer:");

  return lines.join("\n");
}

function buildExplainPrompt(commandText: string): string {
  const cwd = process.cwd();
  const platform = `${os.platform()} ${os.release()}`;
  const shell = detectShell();

  return [
    "You are Ask, a CLI helper that explains shell commands.",
    "",
    "Environment:",
    `- platform: ${platform}`,
    `- shell: ${shell}`,
    `- cwd: ${cwd}`,
    "",
    "Task:",
    "Explain the following command in a concise, step-by-step way.",
    "Focus on what it does, any side effects, and risks.",
    "",
    "Command:",
    commandText,
    "",
    "Answer (short explanation, no markdown code fences):",
  ].join("\n");
}

// ----------------------------
// LLM integration (OpenAI)
// ----------------------------

async function callLLM(prompt: string, apiKey: string): Promise<string> {
  const client = new OpenAI({ apiKey });

  try {
    const res = await client.chat.completions.create({
      model: process.env.ASK_MODEL || "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    const content = res.choices[0]?.message?.content;

    if (!content || !content.trim()) {
      throw new AskContentError("Empty response from OpenAI");
    }

    return content.trim();
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (/api key/i.test(msg) || /authentication/i.test(msg)) {
      throw new AskAuthError(msg);
    }
    if (/timeout/i.test(msg)) {
      throw new AskTimeoutError(msg);
    }
    throw new AskError(msg);
  }
}

// ----------------------------
// Output helpers
// ----------------------------

type ParsedCommand = {
  command: string;
  explanation: string | null;
};

function splitCommandAndExplanation(raw: string): ParsedCommand {
  const lines = raw.split("\n").map((l) => l.trim());
  const commands: string[] = [];
  const explanations: string[] = [];

  for (const line of lines) {
    if (line.startsWith("# explain:")) {
      explanations.push(line.replace(/^# explain:\s*/, "").trim());
    } else {
      commands.push(line);
    }
  }

  return {
    command: commands.join("\n").trim(),
    explanation: explanations.length ? explanations.join(" ") : null,
  };
}

function printHistory(): void {
  const entries = readHistory();
  if (!entries.length) {
    console.log(theme.warning("No history yet."));
    return;
  }

  for (const item of entries) {
    const ts =
      theme.border("[") + theme.accent(item.timestamp) + theme.border("]");
    const mode = theme.label(item.mode);
    console.log(`${ts} ${mode}`);
    console.log(`${theme.label("Q:")} ${item.question}`);
    console.log(`${theme.label(">")} ${item.answer}`);
    console.log("");
  }
}

async function typewriter(text: string, delayMs = 15): Promise<void> {
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

// ----------------------------
// CmdBook integration
// ----------------------------

function saveToCmdBook(command: string, question: string): void {
  if (!commandInPath("cmdbook")) {
    console.log(
      theme.warning(
        "cmdbook is not available on PATH. Install or expose the cmdbook CLI to use --save."
      )
    );
    return;
  }

  const args = ["add", command, "-d", question, "-t", "ask"];
  const res = spawnSync("cmdbook", args, { stdio: "inherit" });

  if (res.status !== 0) {
    console.log(theme.warning("cmdbook add did not complete successfully."));
  }
}

// ----------------------------
// CLI wiring
// ----------------------------

const program = new Command();

program
  .name("ask")
  .description("ask: terminal assistant that generates shell commands")
  .option("--history", "Show previous questions and answers", false)
  .option("--api-key <API_KEY>", "Set or replace your LLM API key")
  .hook("preAction", () => {
    header();
  });

// main generation entry
program
  .argument("[question...]", "What you want to do (natural language)")
  .option("--silent", "Suppress spinner and typewriter", false)
  .option("--type", "Show output with typewriter effect", false)
  .option("--json", "Output JSON instead of formatted text", false)
  .option("--no-clipboard", "Do not copy result to clipboard", false)
  .option("--save", "Save generated command to cmdbook (if available)", false)
  .action(async (questionParts: string[], options: any) => {
    const { silent, type, json, noClipboard, save } = options;
    const globalOpts = program.opts<{ history?: boolean; apiKey?: string }>();

    // global API key handling
    if (globalOpts.apiKey) {
      const cfg = readConfig();
      cfg.apiKey = globalOpts.apiKey;
      writeConfig(cfg);
      console.log(theme.success("API key updated."));
      return;
    }

    if (globalOpts.history) {
      printHistory();
      return;
    }

    const question = questionParts.join(" ").trim();
    if (!question) {
      program.outputHelp();
      return;
    }

    const cfg = readConfig();
    const effectiveApiKey: string | undefined =
      cfg.apiKey || process.env.ASK_CLI_API_KEY || process.env.OPENAI_API_KEY;

    if (!effectiveApiKey) {
      console.error(
        theme.error(
          "No API key configured. Use: ask --api-key YOUR_KEY or set ASK_CLI_API_KEY / OPENAI_API_KEY."
        )
      );
      process.exit(1);
    }

    const spinner = !silent
      ? ora({ text: theme.dim("Generating..."), spinner: "dots" }).start()
      : null;

    let rawText = "";
    try {
      const prompt = buildGeneratePrompt(question);
      rawText = await callLLM(prompt, effectiveApiKey);
      if (spinner) spinner.succeed(theme.success("Done"));
    } catch (err: any) {
      if (spinner) spinner.fail(theme.error("LLM call failed"));
      console.error(theme.error(err?.message || String(err)));
      process.exit(1);
    }

    const stripped = stripCodeFences(rawText);
    if (!stripped.trim()) {
      console.error(theme.warning("Model returned empty output."));
      process.exit(1);
    }

    const parsed = splitCommandAndExplanation(stripped);

    if (json) {
      const payload = {
        mode: "generate" as AskMode,
        question,
        command: parsed.command,
        explanation: parsed.explanation,
      };
      console.log(JSON.stringify(payload, null, 2));
    } else {
      const lines = parsed.command.split("\n");
      const formatted = lines
        .map((line, index) =>
          index === 0 ? `${theme.label(">")} ${line}` : `  ${line}`
        )
        .join("\n");

      if (type && !silent) {
        await typewriter(formatted);
      } else {
        console.log(formatted);
      }

      if (parsed.explanation) {
        console.log();
        console.log(theme.dim(`# explain: ${parsed.explanation}`));
      }
    }

    if (!noClipboard) {
      try {
        await clipboard.write(parsed.command || stripped);
        if (!silent && !json) {
          console.log(theme.success("Copied to clipboard."));
        }
      } catch {
        if (!silent && !json) {
          console.log(theme.warning("Clipboard unavailable."));
        }
      }
    }

    if (save && parsed.command) {
      saveToCmdBook(parsed.command, question);
    }

    appendHistory({
      timestamp: new Date().toISOString(),
      mode: "generate",
      question,
      answer: stripped,
    });
  });

// explain subcommand
program
  .command("explain")
  .description("Explain an existing command instead of generating one")
  .argument("<command...>", "Command to explain")
  .option("--json", "Output JSON instead of plain text", false)
  .action(async (commandParts: string[], options: any) => {
    const { json } = options;

    const commandText = commandParts.join(" ").trim();
    if (!commandText) {
      console.error("Please provide a command to explain.");
      process.exit(1);
    }

    const cfg = readConfig();
    const effectiveApiKey: string | undefined =
      cfg.apiKey || process.env.ASK_CLI_API_KEY || process.env.OPENAI_API_KEY;

    if (!effectiveApiKey) {
      console.error(
        theme.error(
          "No API key configured. Use: ask --api-key YOUR_KEY or set ASK_CLI_API_KEY / OPENAI_API_KEY."
        )
      );
      process.exit(1);
    }

    const spinner = ora({
      text: theme.dim("Explaining..."),
      spinner: "dots",
    }).start();

    let rawText = "";
    try {
      const prompt = buildExplainPrompt(commandText);
      rawText = await callLLM(prompt, effectiveApiKey);
      spinner.succeed(theme.success("Done"));
    } catch (err: any) {
      spinner.fail(theme.error("LLM call failed"));
      console.error(theme.error(err?.message || String(err)));
      process.exit(1);
    }

    const stripped = stripCodeFences(rawText);

    if (json) {
      const payload = {
        mode: "explain" as AskMode,
        command: commandText,
        explanation: stripped,
      };
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(stripped);
    }

    appendHistory({
      timestamp: new Date().toISOString(),
      mode: "explain",
      question: commandText,
      answer: stripped,
    });
  });

program.parse(process.argv);
