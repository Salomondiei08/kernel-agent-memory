import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import {
  estimateTokens,
  formatTokenLogEntry,
  TokenLogEntry,
} from '../utils/token-tracker.js';
import { SessionEndContext } from './types.js';

/**
 * Logs session token usage at the end of a session
 * Estimates tokens from session content and appends to token log
 *
 * @param context - Session end context with content and model information
 * @throws If file operations fail or token estimation fails
 */
export async function logSessionTokens(context: SessionEndContext): Promise<void> {
  // Estimate tokens from session content
  const tokens = estimateTokens(context.sessionContent);

  // Create token log entry
  const entry: TokenLogEntry = {
    timestamp: new Date().toISOString(),
    model: context.model,
    tokens,
    agent: context.agent,
    project: context.project,
  };

  // Format the entry as JSON
  const formattedEntry = formatTokenLogEntry(entry);

  // Ensure .kernel directory exists
  const tokenLogPath = join(context.projectRoot, '.kernel', 'token-log.json');
  const dir = dirname(tokenLogPath);
  await fs.mkdir(dir, { recursive: true });

  // Append to token-log.json (NDJSON format - one JSON object per line)
  try {
    await fs.appendFile(tokenLogPath, formattedEntry + '\n', 'utf-8');
  } catch (error) {
    // If file doesn't exist, create it
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.writeFile(tokenLogPath, formattedEntry + '\n', 'utf-8');
    } else {
      throw error;
    }
  }
}
