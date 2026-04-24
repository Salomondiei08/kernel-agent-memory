import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  readTranscriptText,
  resolveProjectRoot,
  type HookInput,
} from "../src/hooks/hook-input.js";

async function tempTranscript(lines: string[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kernel-transcript-"));
  const file = path.join(dir, "session.jsonl");
  await fs.writeFile(file, lines.join("\n") + "\n", "utf8");
  return file;
}

describe("hook-input", () => {
  it("resolves project root from hook cwd first", () => {
    expect(resolveProjectRoot({ cwd: "/tmp/project" })).toBe("/tmp/project");
  });

  it("extracts text from Claude-style JSONL transcript messages", async () => {
    const transcript = await tempTranscript([
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "Decided: use hooks." },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Fixed: parse transcript JSONL." },
            { type: "tool_use", input: { command: "npm test" } },
          ],
        },
      }),
      "not-json",
    ]);

    const text = await readTranscriptText(transcript);
    expect(text).toContain("Decided: use hooks.");
    expect(text).toContain("Fixed: parse transcript JSONL.");
    expect(text).toContain("npm test");
  });

  it("returns empty text for missing transcripts", async () => {
    expect(await readTranscriptText("/path/that/does/not/exist.jsonl")).toBe("");
  });

  it("accepts the documented hook input shape", () => {
    const input: HookInput = {
      session_id: "abc123",
      transcript_path: "/tmp/session.jsonl",
      cwd: "/tmp/project",
      hook_event_name: "SessionStart",
      source: "startup",
      model: "claude-sonnet-4-6",
    };

    expect(resolveProjectRoot(input)).toBe("/tmp/project");
  });
});
