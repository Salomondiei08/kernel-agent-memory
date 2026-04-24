#!/usr/bin/env node
/**
 * Kernel CLI — single command: `kernel init`.
 *
 * 1. Creates `.kernel/MEMORY.md` in the current working directory.
 * 2. Registers SessionStart/SessionEnd hooks into Claude Code, Codex, and
 *    OpenCode config files (creating them if missing).
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureMemoryFile } from "./memory.js";
import { registerHooks } from "./agent-registry.js";

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
