import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  appendMemory,
  readMemory,
  getRecentMemory,
  getMemoryPath,
  ensureMemoryFile,
} from "../src/memory.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "kernel-memory-"));
}

describe("memory", () => {
  let root: string;
  beforeEach(async () => {
    root = await tempProject();
  });

  it("getMemoryPath returns <root>/.kernel/MEMORY.md", () => {
    expect(getMemoryPath(root)).toBe(path.join(root, ".kernel", "MEMORY.md"));
  });

  it("readMemory returns [] when file is missing", async () => {
    expect(await readMemory(root)).toEqual([]);
  });

  it("ensureMemoryFile creates the file with header", async () => {
    const file = await ensureMemoryFile(root);
    const raw = await fs.readFile(file, "utf8");
    expect(raw).toContain("# Project Memory");
  });

  it("round-trips a single entry", async () => {
    await appendMemory(root, {
      agent: "claude-code",
      key: "decision",
      value: "Use JWT with RS256",
      timestamp: "2026-04-24T12:00:00.000Z",
    });
    const entries = await readMemory(root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      agent: "claude-code",
      key: "decision",
      value: "Use JWT with RS256",
      timestamp: "2026-04-24T12:00:00.000Z",
    });
  });

  it("parses multiple entries in chronological order", async () => {
    await appendMemory(root, {
      agent: "claude-code",
      key: "decision",
      value: "first",
      timestamp: "2026-04-24T10:00:00.000Z",
    });
    await appendMemory(root, {
      agent: "codex",
      key: "bug-fix",
      value: "second",
      timestamp: "2026-04-24T11:00:00.000Z",
    });
    await appendMemory(root, {
      agent: "opencode",
      key: "note",
      value: "third",
      timestamp: "2026-04-24T12:00:00.000Z",
    });

    const entries = await readMemory(root);
    expect(entries.map((e) => e.value)).toEqual(["first", "second", "third"]);
    expect(entries.map((e) => e.agent)).toEqual([
      "claude-code",
      "codex",
      "opencode",
    ]);
  });

  it("preserves multi-line values", async () => {
    const body = "line one\nline two\nline three";
    await appendMemory(root, { agent: "codex", key: "note", value: body });
    const entries = await readMemory(root);
    expect(entries[0].value).toBe(body);
  });

  it("getRecentMemory returns newest first, limited", async () => {
    for (let i = 0; i < 7; i++) {
      await appendMemory(root, {
        agent: "claude-code",
        key: "decision",
        value: `entry-${i}`,
        timestamp: `2026-04-24T0${i}:00:00.000Z`,
      });
    }
    const recent = await getRecentMemory(root, 3);
    expect(recent.map((e) => e.value)).toEqual(["entry-6", "entry-5", "entry-4"]);
  });

  it("getRecentMemory on empty file returns []", async () => {
    expect(await getRecentMemory(root, 5)).toEqual([]);
  });

  it("handles empty but existing file gracefully", async () => {
    await ensureMemoryFile(root);
    expect(await readMemory(root)).toEqual([]);
  });
});
