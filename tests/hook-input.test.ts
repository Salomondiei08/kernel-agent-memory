import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  findCodexTranscript,
  readOpenCodeTranscriptText,
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
    expect(text).not.toContain("Decided: use hooks.");
    expect(text).toContain("Fixed: parse transcript JSONL.");
    expect(text).toContain("npm test");
  });

  it("extracts text from Codex-style JSONL transcript messages", async () => {
    const transcript = await tempTranscript([
      JSON.stringify({
        type: "session_meta",
        payload: {
          id: "session-1",
          cwd: "/tmp/project",
          base_instructions: { text: "Do not include me." },
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "For this test: Decided: codex memory works.",
            },
          ],
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "Decided: codex memory works.",
            },
          ],
        },
      }),
    ]);

    const text = await readTranscriptText(transcript);
    expect(text).toContain("Decided: codex memory works.");
    expect(text).not.toContain("For this test:");
    expect(text).not.toContain("Do not include me.");
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

  it("finds Codex transcript by session id or project cwd", async () => {
    const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "kernel-codex-home-"));
    const dir = path.join(codexHome, "sessions", "2026", "04", "25");
    await fs.mkdir(dir, { recursive: true });
    const transcript = path.join(dir, "rollout-2026-04-25T10-00-00-session-abc.jsonl");
    await fs.writeFile(
      transcript,
      `${JSON.stringify({
        type: "session_meta",
        payload: { id: "session-abc", cwd: "/tmp/project" },
      })}\n`,
      "utf8",
    );

    await expect(
      findCodexTranscript({ session_id: "session-abc" }, "/tmp/project", codexHome),
    ).resolves.toBe(transcript);
    await expect(findCodexTranscript({}, "/tmp/project", codexHome)).resolves.toBe(
      transcript,
    );
  });

  it("reconstructs assistant text from OpenCode storage", async () => {
    const dataHome = await fs.mkdtemp(path.join(os.tmpdir(), "kernel-opencode-data-"));
    const storage = path.join(dataHome, "opencode", "storage");
    const sessionId = "ses_test";
    const messageId = "msg_assistant";

    await fs.mkdir(path.join(storage, "session", "project-test"), { recursive: true });
    await fs.mkdir(path.join(storage, "message", sessionId), { recursive: true });
    await fs.mkdir(path.join(storage, "part", messageId), { recursive: true });

    await fs.writeFile(
      path.join(storage, "session", "project-test", `${sessionId}.json`),
      JSON.stringify({
        id: sessionId,
        directory: "/tmp/project",
        time: { created: 1, updated: 2 },
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(storage, "message", sessionId, "msg_user.json"),
      JSON.stringify({
        id: "msg_user",
        sessionID: sessionId,
        role: "user",
        time: { created: 3 },
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(storage, "message", sessionId, `${messageId}.json`),
      JSON.stringify({
        id: messageId,
        sessionID: sessionId,
        role: "assistant",
        time: { created: 4 },
      }),
      "utf8",
    );
    await fs.mkdir(path.join(storage, "part", "msg_user"), { recursive: true });
    await fs.writeFile(
      path.join(storage, "part", "msg_user", "prt_user.json"),
      JSON.stringify({ type: "text", text: "Decided: ignore user text." }),
      "utf8",
    );
    await fs.writeFile(
      path.join(storage, "part", messageId, "prt_1.json"),
      JSON.stringify({ type: "text", text: "Decided: opencode memory works." }),
      "utf8",
    );

    await expect(
      readOpenCodeTranscriptText({ session_id: sessionId }, "/tmp/project", dataHome),
    ).resolves.toBe("Decided: opencode memory works.");
    await expect(readOpenCodeTranscriptText({}, "/tmp/project", dataHome)).resolves.toBe(
      "Decided: opencode memory works.",
    );
  });
});
