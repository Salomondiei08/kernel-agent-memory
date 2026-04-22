import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { readMemoryFile } from '../utils/file-ops.js';
import { HookContext } from './types.js';

/**
 * Injects session start context by reading top 5 recent memory entries
 * and writing them to a context file for consumption by Claude Code
 *
 * @param context - Hook context with session and project metadata
 * @throws If file operations fail or memory handler fails
 */
export async function injectSessionStartContext(context: HookContext): Promise<void> {
  // Read memory entries from .kernel/MEMORY.md
  const memoryPath = join(context.projectRoot, '.kernel', 'MEMORY.md');
  const entries = await readMemoryFile(memoryPath);

  // Sort by timestamp (newest first) and take top 5
  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const top5 = entries.slice(0, 5);

  // Format as markdown
  let contextContent = '# Project Context (from Kernel)\n\n';

  if (top5.length === 0) {
    contextContent += 'No previous session context found.\n';
  } else {
    for (const entry of top5) {
      contextContent += `- **${entry.key}**: ${entry.value}\n`;
    }
  }

  // Write to .kernel/.session-context
  const contextPath = join(context.projectRoot, '.kernel', '.session-context');

  // Ensure directory exists
  const dir = dirname(contextPath);
  await fs.mkdir(dir, { recursive: true });

  // Write the context file
  await fs.writeFile(contextPath, contextContent, 'utf-8');
}
