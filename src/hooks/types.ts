/**
 * Context information passed to hooks
 * Contains session metadata and environment details
 */
export interface HookContext {
  sessionId: string;
  agent: 'claude-code' | 'codex' | 'opencode';
  project: string;
  projectRoot: string;
}

/**
 * Extended context for session end hooks
 * Includes session content and model information
 */
export interface SessionEndContext extends HookContext {
  sessionContent: string;
  model: string;
}
