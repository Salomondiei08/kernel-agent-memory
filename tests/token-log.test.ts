import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  appendTokenLog,
  estimateTokens,
  formatTokenLogEntry,
  getTokenLogPath,
  parseTokenLog,
} from "../src/token-log.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "kernel-token-log-"));
}

describe("token-log", () => {
  let root: string;

  beforeEach(async () => {
    root = await tempProject();
  });

  it("getTokenLogPath returns <root>/.kernel/token-log.json", () => {
    expect(getTokenLogPath(root)).toBe(path.join(root, ".kernel", "token-log.json"));
  });

  it("estimates tokens deterministically from character count", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("formats and parses valid entries", () => {
    const line = formatTokenLogEntry({
      timestamp: "2026-04-24T12:00:00.000Z",
      model: "gpt-5",
      tokens: 12,
      agent: "codex",
      project: "kernel",
      chars: 48,
    });

    expect(parseTokenLog(line)).toEqual([
      {
        timestamp: "2026-04-24T12:00:00.000Z",
        model: "gpt-5",
        tokens: 12,
        agent: "codex",
        project: "kernel",
        chars: 48,
      },
    ]);
  });

  it("skips malformed and incomplete lines while preserving valid entries", () => {
    const content = [
      "not json",
      "{\"timestamp\":\"2026-04-24T12:00:00.000Z\",\"model\":\"gpt-5\"}",
      "{\"timestamp\":\"2026-04-24T12:01:00.000Z\",\"model\":\"gpt-5\",\"tokens\":3,\"agent\":\"codex\",\"project\":\"kernel\",\"chars\":12}",
    ].join("\n");

    const parsed = parseTokenLog(content);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].tokens).toBe(3);
  });

  it("appends NDJSON entries to the project token log", async () => {
    const first = await appendTokenLog({
      projectRoot: root,
      agent: "claude-code",
      model: "claude",
      text: "hello world",
      timestamp: "2026-04-24T12:00:00.000Z",
    });
    const second = await appendTokenLog({
      projectRoot: root,
      agent: "codex",
      model: "gpt",
      text: "a longer transcript",
      timestamp: "2026-04-24T12:01:00.000Z",
    });

    const raw = await fs.readFile(getTokenLogPath(root), "utf8");
    expect(parseTokenLog(raw)).toEqual([first, second]);
  });
});
