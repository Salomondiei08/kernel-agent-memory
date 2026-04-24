/**
 * Agent registry: installs Kernel's SessionStart / SessionEnd hooks into the
 * per-agent config files for Claude Code, Codex, and OpenCode.
 *
 * Each config is treated as a JSON blob. We deep-merge our `hooks` block in
 * and preserve every other key (permissions, enabledPlugins, model, theme).
 * Missing config files are created.
 */

import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type AgentId = "claude-code" | "codex" | "opencode";

export interface AgentConfig {
  id: AgentId;
  /** Absolute path to the config file we merge hooks into. */
  configPath: string;
}

/** Enumerate the three agents and where their config lives on disk. */
export function getAgents(homeDir: string = os.homedir()): AgentConfig[] {
  return [
    { id: "claude-code", configPath: path.join(homeDir, ".claude", "settings.json") },
    { id: "codex", configPath: path.join(homeDir, ".codex", "config.json") },
    { id: "opencode", configPath: path.join(homeDir, ".opencode", "config.json") },
  ];
}

interface HookCommandBlock {
  matcher: string;
  hooks: Array<{ type: "command"; command: string }>;
}

interface HooksConfig {
  SessionStart?: HookCommandBlock[];
  SessionEnd?: HookCommandBlock[];
  [k: string]: HookCommandBlock[] | undefined;
}

interface AgentSettings {
  hooks?: HooksConfig;
  [k: string]: unknown;
}

function shellQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function buildHookBlocks(kernelRoot: string): HooksConfig {
  const startCmd = `node ${shellQuote(path.join(kernelRoot, "dist", "hooks", "session-start.js"))}`;
  const endCmd = `node ${shellQuote(path.join(kernelRoot, "dist", "hooks", "session-end.js"))}`;
  return {
    SessionStart: [{ matcher: "*", hooks: [{ type: "command", command: startCmd }] }],
    SessionEnd: [{ matcher: "*", hooks: [{ type: "command", command: endCmd }] }],
  };
}

/** Read a JSON file, treating missing files as `{}`. Invalid JSON throws. */
async function readJsonOrEmpty(file: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(file, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

/**
 * Merge Kernel's hooks into an agent settings object.
 *
 * Within `hooks.SessionStart` / `hooks.SessionEnd`, filter out any existing
 * blocks that already point at a Kernel dist file (so re-running `kernel init`
 * is idempotent) and then append the fresh blocks. Other hook events
 * (PreToolUse, Stop, etc.) are preserved untouched.
 */
export function mergeHooks(
  existing: Record<string, unknown>,
  kernelRoot: string,
): AgentSettings {
  const merged: AgentSettings = { ...(existing as AgentSettings) };
  const currentHooks: HooksConfig = { ...(merged.hooks ?? {}) };
  const fresh = buildHookBlocks(kernelRoot);

  const kernelHookMarker = `${path.sep}dist${path.sep}hooks${path.sep}session-`;
  const isKernelBlock = (b: HookCommandBlock): boolean =>
    (b.hooks ?? []).some(
      (h) => typeof h.command === "string" && h.command.includes(kernelHookMarker),
    );

  for (const event of ["SessionStart", "SessionEnd"] as const) {
    const prev = (currentHooks[event] ?? []).filter((b) => !isKernelBlock(b));
    currentHooks[event] = [...prev, ...(fresh[event] ?? [])];
  }

  merged.hooks = currentHooks;
  return merged;
}

export interface RegisterResult {
  agent: AgentId;
  configPath: string;
  created: boolean;
}

/**
 * Register Kernel hooks in every known agent config. Creates parent dirs and
 * files as needed. Idempotent.
 */
export async function registerHooks(
  kernelRoot: string,
  homeDir: string = os.homedir(),
): Promise<RegisterResult[]> {
  const results: RegisterResult[] = [];
  for (const agent of getAgents(homeDir)) {
    await fs.mkdir(path.dirname(agent.configPath), { recursive: true });

    let created = false;
    try {
      await fs.access(agent.configPath);
    } catch {
      created = true;
    }

    const existing = await readJsonOrEmpty(agent.configPath);
    const merged = mergeHooks(existing, kernelRoot);
    await fs.writeFile(agent.configPath, JSON.stringify(merged, null, 2) + "\n", "utf8");

    results.push({ agent: agent.id, configPath: agent.configPath, created });
  }
  return results;
}
