#!/usr/bin/env node
/**
 * Kernel CLI — single command: `kernel init`.
 *
 * 1. Creates `.kernel/MEMORY.md` in the current working directory.
 * 2. Registers SessionStart/SessionEnd hooks into Claude Code, Codex, and
 *    OpenCode config files (creating them if missing).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureMemoryFile } from "./memory.js";
import { registerHooks } from "./agent-registry.js";

const GITIGNORE_ENTRY = ".kernel/";

/**
 * Appends `.kernel/` to the project's .gitignore if not already present.
 * Creates .gitignore if it doesn't exist.
 */
async function ensureGitignore(cwd: string): Promise<boolean> {
  const gitignorePath = path.join(cwd, ".gitignore");
  let content = "";
  try {
    content = await fs.readFile(gitignorePath, "utf8");
  } catch {
    // file doesn't exist yet — will be created
  }

  const lines = content.split("\n");
  const alreadyIgnored = lines.some(
    (l) => l.trim() === GITIGNORE_ENTRY || l.trim() === ".kernel"
  );
  if (alreadyIgnored) return false;

  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  await fs.writeFile(
    gitignorePath,
    `${content}${separator}# Kernel runtime data — session memory and locks\n${GITIGNORE_ENTRY}\n`,
    "utf8"
  );
  return true;
}

const CHECK = "\u2713";

/**
 * The kernel root is the directory that contains the `dist/` folder this
 * script lives inside. When invoked as `node dist/cli.js`, __dirname is
 * `<kernelRoot>/dist`, so we go up one level.
 */
function resolveKernelRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

export async function init(cwd: string = process.cwd()): Promise<void> {
  const kernelRoot = resolveKernelRoot();

  const memoryFile = await ensureMemoryFile(cwd);
  const memoryRel = path.relative(cwd, memoryFile) || memoryFile;
  process.stdout.write(`${CHECK} Created ${memoryRel}\n`);

  const gitignoreAdded = await ensureGitignore(cwd);
  if (gitignoreAdded) {
    process.stdout.write(`${CHECK} Added .kernel/ to .gitignore\n`);
  }

  const results = await registerHooks(kernelRoot);
  for (const r of results) {
    const verb = r.created ? "Created" : "Updated";
    process.stdout.write(`${CHECK} ${verb} hooks for ${r.agent} (${r.configPath})\n`);
  }

  process.stdout.write(
    `\nKernel is ready. Start a session in any agent to begin syncing memory.\n`,
  );
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (!cmd || cmd === "init") {
    await init();
    return;
  }
  process.stderr.write(`Unknown command: ${cmd}\nUsage: kernel init\n`);
  process.exit(1);
}

const isDirect = import.meta.url === `file://${process.argv[1]}`;
if (isDirect) {
  main().catch((err) => {
    process.stderr.write(`kernel: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
