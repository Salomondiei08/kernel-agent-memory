import { describe, it, expect } from "vitest";
import { extractSnippets } from "../src/session-scanner.js";

describe("session-scanner", () => {
  it("returns [] for empty text", () => {
    expect(extractSnippets("", "claude-code")).toEqual([]);
  });

  it("extracts a decision line", () => {
    const text = "We decided: use JWT with RS256 for all new services.";
    const out = extractSnippets(text, "claude-code");
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].key).toBe("decision");
    expect(out[0].value).toContain("use JWT with RS256");
  });

  it("classifies fixed/implement/avoid/architecture", () => {
    const text = [
      "Fixed: token validation needed <= not <.",
      "Implement: new caching layer for ranker.",
      "Avoid: calling the slow endpoint in a loop.",
      "Architecture: hex ports/adapters with injected repos.",
    ].join("\n");

    const out = extractSnippets(text, "codex");
    const keys = out.map((s) => s.key);
    expect(keys).toContain("bug-fix");
    expect(keys).toContain("implementation");
    expect(keys).toContain("avoid");
    expect(keys).toContain("architecture");
  });

  it("extracts fenced code blocks with preceding context", () => {
    const text =
      "Here's the new auth function.\n```ts\nexport function auth() { return true; }\n```\n";
    const out = extractSnippets(text, "claude-code");
    const codeSnippets = out.filter((s) => s.key === "code-snippet");
    expect(codeSnippets).toHaveLength(1);
    expect(codeSnippets[0].value).toContain("auth function");
    expect(codeSnippets[0].value).toContain("export function auth()");
  });

  it("clamps values to <= 500 chars", () => {
    const long = "x".repeat(2000);
    const text = `decided: ${long}`;
    const out = extractSnippets(text, "codex");
    expect(out[0].value.length).toBeLessThanOrEqual(500);
  });

  it("caps at 10 snippets total", () => {
    const lines = Array.from({ length: 25 }, (_, i) => `decided: item ${i}`);
    const out = extractSnippets(lines.join("\n"), "claude-code");
    expect(out.length).toBeLessThanOrEqual(10);
  });

  it("is case-insensitive on keywords", () => {
    const out = extractSnippets("DECIDED: go with postgres.", "codex");
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].key).toBe("decision");
  });

  it("ignores lines without keywords", () => {
    const out = extractSnippets(
      "The weather was nice.\nI had coffee.\n",
      "claude-code",
    );
    expect(out).toEqual([]);
  });
});
