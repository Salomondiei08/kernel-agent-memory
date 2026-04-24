import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readMemory } from "../src/memory.js";
import { runSessionEnd } from "../src/hooks/session-end.js";
import { runSessionStart } from "../src/hooks/session-start.js";
import { getTokenLogPath, parseTokenLog } from "../src/token-log.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "kernel-hooks-"));
}

describe("hooks", () => {
  it("SessionEnd writes snippets and a token log entry", async () => {
    const root = await tempProject();
    const count = await runSessionEnd({
      projectRoot: root,
      agent: "claude-code",
      model: "claude-sonnet",
      sessionText: "Decided: use a shared MEMORY.md file for agent context.",
    });

    expect(count).toBe(1);
    expect((await readMemory(root))[0]).toMatchObject({
      agent: "claude-code",
      key: "decision",
    });

    const tokenEntries = parseTokenLog(await fs.readFile(getTokenLogPath(root), "utf8"));
    expect(tokenEntries).toHaveLength(1);
    expect(tokenEntries[0]).toMatchObject({
      agent: "claude-code",
      model: "claude-sonnet",
      project: path.basename(root),
    });
    expect(tokenEntries[0].tokens).toBeGreaterThan(0);
  });

  it("SessionEnd logs tokens even when there are no memory snippets", async () => {
    const root = await tempProject();
    const count = await runSessionEnd({
      projectRoot: root,
      agent: "codex",
      model: "gpt",
      sessionText: "A transcript with no keyword-style memory lines.",
    });

    expect(count).toBe(0);
    expect(await readMemory(root)).toEqual([]);
    expect(parseTokenLog(await fs.readFile(getTokenLogPath(root), "utf8"))).toHaveLength(1);
  });

  it("SessionStart prints recent memory context", async () => {
    const root = await tempProject();
    await runSessionEnd({
      projectRoot: root,
      agent: "codex",
      model: "gpt",
      sessionText: "Fixed: preserve unrelated hook config during init.",
    });

    const output = await runSessionStart(root);
    expect(output).toContain("# Project Context (from Kernel)");
    expect(output).toContain("preserve unrelated hook config");
  });
});
