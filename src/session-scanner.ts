/**
 * Session scanner: pulls short, high-signal snippets out of raw session text
 * using cheap regex heuristics. No AI calls — this runs in the SessionEnd hook
 * and must be fast + deterministic.
 */

export interface Snippet {
  key: string;
  value: string;
}

const MAX_SNIPPETS = 10;
const MAX_VALUE_CHARS = 500;

// Single-line "keyword: rest of line" matcher used to classify a hit.
const DECISION_RE =
  /^.*\b(decided|decision|implement(?:ed)?|fixed|fix|avoid|pattern|architecture)\b\s*:\s*(.+)$/i;

// Global variant used to iterate across all lines of the session.
const DECISION_LINE_RE =
  /^[^\n]*\b(decided|decision|implement(?:ed)?|fixed|fix|avoid|pattern|architecture)\b\s*:\s*[^\n]+$/gim;

/** Truncate a value to MAX_VALUE_CHARS with an ellipsis on overflow. */
function clamp(value: string): string {
  const v = value.trim();
  if (v.length <= MAX_VALUE_CHARS) return v;
  return v.slice(0, MAX_VALUE_CHARS - 1) + "…";
}

/** Canonicalise a keyword hit into one of a small set of memory keys. */
function classify(keyword: string): string {
  const k = keyword.toLowerCase();
  if (k.startsWith("decid") || k === "decision") return "decision";
  if (k === "fix" || k === "fixed") return "bug-fix";
  if (k.startsWith("implement")) return "implementation";
  if (k === "avoid") return "avoid";
  if (k === "pattern" || k === "architecture") return "architecture";
  return "note";
}

/**
 * Scan `sessionText` and return up to MAX_SNIPPETS short snippets of two kinds:
 *  - decision lines (regex keyword hits)
 *  - fenced code blocks (```...```) with the preceding sentence as prefix
 *
 * `agent` is accepted for future per-agent tuning but not used yet.
 */
export function extractSnippets(sessionText: string, _agent: string): Snippet[] {
  const out: Snippet[] = [];

  // 1. Decision-style lines
  const decisionMatches = sessionText.match(DECISION_LINE_RE) ?? [];
  for (const line of decisionMatches) {
    if (out.length >= MAX_SNIPPETS) break;
    const parsed = line.match(DECISION_RE);
    if (!parsed) continue;
    out.push({ key: classify(parsed[1]), value: clamp(line.trim()) });
  }

  // 2. Fenced code blocks — capture the block plus the nearest preceding
  // non-empty line as context.
  const codeBlockRe = /```[^\n]*\n([\s\S]*?)```/g;
  let cb: RegExpExecArray | null;
  while ((cb = codeBlockRe.exec(sessionText)) !== null) {
    if (out.length >= MAX_SNIPPETS) break;

    const before = sessionText.slice(0, cb.index);
    const prevLines = before.split("\n").map((l) => l.trim()).filter(Boolean);
    const prefix = prevLines[prevLines.length - 1] ?? "";
    const body = cb[1].trim();
    const combined = prefix
      ? `${prefix}\n\n\`\`\`\n${body}\n\`\`\``
      : `\`\`\`\n${body}\n\`\`\``;
    out.push({ key: "code-snippet", value: clamp(combined) });
  }

  return out.slice(0, MAX_SNIPPETS);
}
