import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getAgents,
  mergeHooks,
  registerHooks,
} from "../src/agent-registry.js";

async function tempHome(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "kernel-home-"));
}

describe("agent-registry", () => {
  let home: string;
  const kernelRoot = "/fake/kernel";

  beforeEach(async () => {
    home = await tempHome();
  });

  it("lists three agents with correct paths", () => {
    const agents = getAgents(home);
    expect(agents.map((a) => a.id)).toEqual([
      "claude-code",
      "codex",
      "opencode",
    ]);
    expect(agents[0].configPath).toBe(path.join(home, ".claude", "settings.json"));
  });

  it("mergeHooks adds SessionStart and SessionEnd blocks", () => {
    const merged = mergeHooks({}, kernelRoot);
    expect(merged.hooks?.SessionStart).toHaveLength(1);
    expect(merged.hooks?.SessionEnd).toHaveLength(1);
    expect(merged.hooks!.SessionStart![0].hooks[0].command).toContain(
      "session-start.js",
    );
  });

  it("mergeHooks quotes hook script paths for shell execution", () => {
    const merged = mergeHooks({}, "/fake/kernel with spaces");
    expect(merged.hooks!.SessionStart![0].hooks[0].command).toBe(
      'node "/fake/kernel with spaces/dist/hooks/session-start.js"',
    );
    expect(merged.hooks!.SessionEnd![0].hooks[0].command).toBe(
      'node "/fake/kernel with spaces/dist/hooks/session-end.js"',
    );
  });

  it("mergeHooks preserves unrelated top-level keys", () => {
    const existing = {
      permissions: { allow: ["bash"] },
      enabledPlugins: { foo: true },
      theme: "dark",
    };
    const merged = mergeHooks(existing, kernelRoot);
    expect(merged.permissions).toEqual({ allow: ["bash"] });
    expect(merged.enabledPlugins).toEqual({ foo: true });
    expect(merged.theme).toBe("dark");
  });

  it("mergeHooks preserves unrelated hook events", () => {
    const existing = {
      hooks: {
        PreToolUse: [
          { matcher: "*", hooks: [{ type: "command", command: "echo hi" }] },
        ],
      },
    };
    const merged = mergeHooks(existing, kernelRoot);
    expect(merged.hooks?.PreToolUse).toEqual(existing.hooks.PreToolUse);
    expect(merged.hooks?.SessionStart).toBeDefined();
  });

  it("mergeHooks is idempotent — re-running does not duplicate kernel blocks", () => {
    const once = mergeHooks({}, kernelRoot);
    const twice = mergeHooks(once as Record<string, unknown>, kernelRoot);
    expect(twice.hooks?.SessionStart).toHaveLength(1);
    expect(twice.hooks?.SessionEnd).toHaveLength(1);
  });

  it("registerHooks creates config files that did not exist", async () => {
    const results = await registerHooks(kernelRoot, home);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.created).toBe(true);
      const parsed = JSON.parse(await fs.readFile(r.configPath, "utf8"));
      expect(parsed.hooks.SessionStart).toHaveLength(1);
      expect(parsed.hooks.SessionEnd).toHaveLength(1);
    }
  });

  it("registerHooks preserves existing config content", async () => {
    const claudeConfig = path.join(home, ".claude", "settings.json");
    await fs.mkdir(path.dirname(claudeConfig), { recursive: true });
    await fs.writeFile(
      claudeConfig,
      JSON.stringify({ permissions: { allow: ["npm"] }, theme: "dark" }),
    );

    await registerHooks(kernelRoot, home);
    const parsed = JSON.parse(await fs.readFile(claudeConfig, "utf8"));
    expect(parsed.permissions).toEqual({ allow: ["npm"] });
    expect(parsed.theme).toBe("dark");
    expect(parsed.hooks.SessionStart).toHaveLength(1);
  });

  it("registerHooks is idempotent across multiple calls", async () => {
    await registerHooks(kernelRoot, home);
    await registerHooks(kernelRoot, home);
    const parsed = JSON.parse(
      await fs.readFile(
        path.join(home, ".claude", "settings.json"),
        "utf8",
      ),
    );
    expect(parsed.hooks.SessionStart).toHaveLength(1);
    expect(parsed.hooks.SessionEnd).toHaveLength(1);
  });
});
