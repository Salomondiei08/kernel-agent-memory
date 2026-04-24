/**
 * Agent registry: installs Kernel's SessionStart / SessionEnd hooks into the
 * per-agent config surface for Claude Code, Codex, and OpenCode.
 *
 * Each agent has a different hook surface:
 *
 *   claude-code -> ~/.claude/settings.json         (JSON hooks block)
 *   codex       -> ~/.codex/hooks.json             (Claude-compatible JSON
 *                                                   that Codex loads next
 *                                                   to its config layers,
 *                                                   with codex_hooks enabled)
 *   opencode    -> ~/.config/opencode/plugins/kernel-memory.js
 *                                                  (generated plugin that
 *                                                   bridges session events
 *                                                   where possible to our
 *                                                   Node hook scripts)
 *
 * Every hook command is invoked as `node <script> <agent-id>` so the hook
 * can label memory entries with the right agent.
 */

import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type AgentId = "claude-code" | "codex" | "opencode";

export interface AgentConfig {
  id: AgentId;
  /** Absolute path to the config/plugin file we write for this agent. */
  configPath: string;
}

/** Enumerate agents and their hook surface paths. */
export function getAgents(homeDir: string = os.homedir()): AgentConfig[] {
  return [
    {
      id: "claude-code",
      configPath: path.join(homeDir, ".claude", "settings.json"),
    },
    {
      id: "codex",
      configPath: path.join(homeDir, ".codex", "hooks.json"),
    },
    {
      id: "opencode",
      configPath: path.join(
        homeDir,
        ".config",
        "opencode",
        "plugins",
        "kernel-memory.js",
      ),
    },
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

/** Build the node-command hook blocks for Claude Code / Codex JSON surfaces. */
function buildHookBlocks(kernelRoot: string, agent: AgentId): HooksConfig {
  const start = `node ${shellQuote(path.join(kernelRoot, "dist", "hooks", "session-start.js"))} ${agent}`;
  const end = `node ${shellQuote(path.join(kernelRoot, "dist", "hooks", "session-end.js"))} ${agent}`;
  const hooks: HooksConfig = {
    SessionStart: [{ matcher: "*", hooks: [{ type: "command", command: start }] }],
  };

  // Claude Code's lifecycle end event is SessionEnd; Codex currently exposes
  // Stop for the equivalent "the agent has finished this session/turn" surface.
  const endEvent = agent === "codex" ? "Stop" : "SessionEnd";
  hooks[endEvent] = [{ matcher: "*", hooks: [{ type: "command", command: end }] }];
  return hooks;
}

/** Read a JSON file, treating missing/empty as `{}`. Invalid JSON throws. */
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
 * Merge Kernel's hooks into an agent settings object. Drops any existing
 * block that already points at a Kernel dist script (idempotent re-init),
 * then appends the fresh blocks. Unrelated events and top-level keys are
 * preserved untouched.
 */
export function mergeHooks(
  existing: Record<string, unknown>,
  kernelRoot: string,
  agent: AgentId = "claude-code",
): AgentSettings {
  const merged: AgentSettings = { ...(existing as AgentSettings) };
  const currentHooks: HooksConfig = { ...(merged.hooks ?? {}) };
  const fresh = buildHookBlocks(kernelRoot, agent);

  const kernelHookMarker = `${path.sep}dist${path.sep}hooks${path.sep}session-`;
  const isKernelBlock = (b: HookCommandBlock): boolean =>
    (b.hooks ?? []).some(
      (h) => typeof h.command === "string" && h.command.includes(kernelHookMarker),
    );

  for (const event of ["SessionStart", "SessionEnd", "Stop"] as const) {
    const prev = (currentHooks[event] ?? []).filter((b) => !isKernelBlock(b));
    if (fresh[event]) {
      currentHooks[event] = [...prev, ...(fresh[event] ?? [])];
    } else if (prev.length > 0) {
      currentHooks[event] = prev;
    } else {
      delete currentHooks[event];
    }
  }

  merged.hooks = currentHooks;
  return merged;
}

/**
 * Generate the OpenCode plugin source. OpenCode plugins export a factory
 * that receives context and returns event handlers. We subscribe to
 * session.start (prints memory to stdout) and session.idle (captures snippets
 * from OpenCode's local JSON storage). The payload we pipe to the Node hook scripts is
 * Claude-compatible so the hook scripts stay agent-agnostic.
 */
function buildOpenCodePlugin(kernelRoot: string): string {
  const startScript = path.join(kernelRoot, "dist", "hooks", "session-start.js");
  const endScript = path.join(kernelRoot, "dist", "hooks", "session-end.js");
  return `// Auto-generated by Kernel. Do not edit — re-run \`kernel init\` to regenerate.
import { spawn } from "node:child_process";

const START_SCRIPT = ${JSON.stringify(startScript)};
const END_SCRIPT = ${JSON.stringify(endScript)};

function runHook(script, payload) {
  return new Promise((resolve) => {
    const child = spawn("node", [script, "opencode"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_PROJECT_DIR: payload.cwd || process.cwd() },
    });
    let out = "";
    child.stdout.on("data", (c) => { out += c.toString(); });
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(out));
    child.stdin.end(JSON.stringify(payload));
  });
}

export const KernelMemoryPlugin = async ({ project, directory, worktree } = {}) => {
  const cwd = (worktree && worktree.path) || directory || (project && project.worktree) || process.cwd();
  return {
    event: async ({ event } = {}) => {
      if (!event || !event.type) return;
      const sessionId = event.properties && (event.properties.sessionID || event.properties.sessionId);
      if (event.type === "session.created") {
        const out = await runHook(START_SCRIPT, {
          session_id: sessionId,
          cwd,
          hook_event_name: "SessionStart",
          source: "startup",
        });
        if (out && out.trim()) process.stdout.write(out);
      }
      if (event.type === "session.idle") {
        await runHook(END_SCRIPT, {
          session_id: sessionId,
          cwd,
          hook_event_name: "SessionEnd",
          reason: "idle",
        });
      }
    },
  };
};
`;
}

async function enableCodexHooks(homeDir: string): Promise<void> {
  const configPath = path.join(homeDir, ".codex", "config.toml");
  let raw = "";
  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  if (/^\s*codex_hooks\s*=\s*true\s*$/m.test(raw)) return;

  let next: string;
  if (/^\s*codex_hooks\s*=\s*false\s*$/m.test(raw)) {
    next = raw.replace(/^\s*codex_hooks\s*=\s*false\s*$/m, "codex_hooks = true");
  } else if (/^\s*\[features\]\s*$/m.test(raw)) {
    next = raw.replace(
      /^\s*\[features\]\s*$/m,
      (section) => `${section}\ncodex_hooks = true`,
    );
  } else {
    const sep = raw.length === 0 || raw.endsWith("\n") ? "" : "\n";
    next = `${raw}${sep}\n[features]\ncodex_hooks = true\n`;
  }

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, next, "utf8");
}

export interface RegisterResult {
  agent: AgentId;
  configPath: string;
  created: boolean;
}

/**
 * Register Kernel hooks for every known agent. Creates parent directories
 * and target files as needed. Idempotent.
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

    if (agent.id === "opencode") {
      await fs.writeFile(agent.configPath, buildOpenCodePlugin(kernelRoot), "utf8");
    } else {
      const existing = await readJsonOrEmpty(agent.configPath);
      const merged = mergeHooks(existing, kernelRoot, agent.id);
      await fs.writeFile(
        agent.configPath,
        JSON.stringify(merged, null, 2) + "\n",
        "utf8",
      );
      if (agent.id === "codex") {
        await enableCodexHooks(homeDir);
      }
    }

    results.push({ agent: agent.id, configPath: agent.configPath, created });
  }
  return results;
}
