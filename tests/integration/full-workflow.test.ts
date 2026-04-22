import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { resolve, join } from 'path';
import { loadConfig, saveConfig, type KernelConfig, DEFAULT_CONFIG } from '../../src/utils/config.js';
import { readMemoryFile, writeMemoryEntry, type MemoryEntry } from '../../src/utils/file-ops.js';
import { parseTokenLog, formatTokenLogEntry, type TokenLogEntry } from '../../src/utils/token-tracker.js';
import { injectSessionStartContext } from '../../src/hooks/session-start.js';
import { logSessionTokens } from '../../src/hooks/session-end.js';
import { MemoryHandler } from '../../src/mcp/memory-handler.js';
import type { HookContext, SessionEndContext } from '../../src/hooks/types.js';

/**
 * Integration test suite for multi-component workflows
 * Tests verify that different components work together correctly
 */
describe('Integration: Full Workflow', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = resolve('/tmp', `kernel-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('CLI init → config created', () => {
    it('should create kernel.json with bare mode via CLI', async () => {
      const kernelDir = join(testDir, '.kernel');
      const configPath = join(kernelDir, 'kernel.json');

      // Simulate CLI init command: kernel init --mode bare
      const config: KernelConfig = {
        ...DEFAULT_CONFIG,
        mode: 'bare',
        projectRoot: testDir,
      };

      await fs.mkdir(kernelDir, { recursive: true });
      await saveConfig(configPath, config);

      // Verify config file exists
      const exists = await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // Verify config can be loaded and mode is correct
      const loadedConfig = await loadConfig(configPath);
      expect(loadedConfig.mode).toBe('bare');
      expect(loadedConfig.projectRoot).toBe(testDir);
    });

    it('should create kernel.json with full mode via CLI', async () => {
      const kernelDir = join(testDir, '.kernel');
      const configPath = join(kernelDir, 'kernel.json');

      // Simulate CLI init with full mode
      const config: KernelConfig = {
        ...DEFAULT_CONFIG,
        mode: 'full',
        projectRoot: testDir,
      };

      await fs.mkdir(kernelDir, { recursive: true });
      await saveConfig(configPath, config);

      const loadedConfig = await loadConfig(configPath);
      expect(loadedConfig.mode).toBe('full');
    });

    it('should preserve config on save and load', async () => {
      const kernelDir = join(testDir, '.kernel');
      const configPath = join(kernelDir, 'kernel.json');

      const originalConfig: KernelConfig = {
        mode: 'full',
        memoryBackend: 'sqlite',
        version: '1.2.3',
        projectRoot: testDir,
      };

      await fs.mkdir(kernelDir, { recursive: true });
      await saveConfig(configPath, originalConfig);

      const loadedConfig = await loadConfig(configPath);
      expect(loadedConfig).toEqual(originalConfig);
    });
  });

  describe('CLI init → memory files created', () => {
    it('should create MEMORY.md during init', async () => {
      const kernelDir = join(testDir, '.kernel');
      const memoryPath = join(kernelDir, 'MEMORY.md');

      // Simulate CLI init creating MEMORY.md
      await fs.mkdir(kernelDir, { recursive: true });
      const memoryContent = '# Project Memory\n\n';
      await fs.writeFile(memoryPath, memoryContent, 'utf-8');

      const exists = await fs
        .access(memoryPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      const content = await fs.readFile(memoryPath, 'utf-8');
      expect(content).toContain('# Project Memory');
    });

    it('should create token-log.json during init', async () => {
      const kernelDir = join(testDir, '.kernel');
      const tokenLogPath = join(kernelDir, 'token-log.json');

      // Simulate CLI init creating token-log.json
      await fs.mkdir(kernelDir, { recursive: true });
      const tokenLogContent = '';
      await fs.writeFile(tokenLogPath, tokenLogContent, 'utf-8');

      const exists = await fs
        .access(tokenLogPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should allow reading empty memory file', async () => {
      const kernelDir = join(testDir, '.kernel');
      const memoryPath = join(kernelDir, 'MEMORY.md');

      await fs.mkdir(kernelDir, { recursive: true });
      await fs.writeFile(memoryPath, '# Project Memory\n\n', 'utf-8');

      const entries = await readMemoryFile(memoryPath);
      expect(entries).toEqual([]);
    });
  });

  describe('Add memory → SessionStart injects', () => {
    it('should inject session context from memory entries', async () => {
      const kernelDir = join(testDir, '.kernel');
      const memoryPath = join(kernelDir, 'MEMORY.md');
      const contextPath = join(kernelDir, '.session-context');

      await fs.mkdir(kernelDir, { recursive: true });

      // Create initial MEMORY.md
      await fs.writeFile(memoryPath, '# Project Memory\n\n', 'utf-8');

      // Add memory entries manually
      const entry1: MemoryEntry = {
        key: 'database_schema',
        value: 'PostgreSQL with 3 main tables: users, projects, tokens',
        timestamp: new Date(Date.now() - 10000).toISOString(),
        agent: 'claude-code',
      };

      const entry2: MemoryEntry = {
        key: 'api_endpoint',
        value: 'http://localhost:3000/api/v1',
        timestamp: new Date().toISOString(),
        agent: 'claude-code',
      };

      await writeMemoryEntry(memoryPath, entry1);
      await writeMemoryEntry(memoryPath, entry2);

      // Call injectSessionStartContext
      const context: HookContext = {
        sessionId: 'sess-123',
        agent: 'claude-code',
        project: 'test-project',
        projectRoot: testDir,
      };

      await injectSessionStartContext(context);

      // Verify context file was created
      const exists = await fs
        .access(contextPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // Verify content contains memory entries formatted as markdown
      const content = await fs.readFile(contextPath, 'utf-8');
      expect(content).toContain('# Project Context');
      expect(content).toContain('api_endpoint');
      expect(content).toContain('database_schema');
    });

    it('should inject top 5 most recent entries', async () => {
      const kernelDir = join(testDir, '.kernel');
      const memoryPath = join(kernelDir, 'MEMORY.md');

      await fs.mkdir(kernelDir, { recursive: true });
      await fs.writeFile(memoryPath, '# Project Memory\n\n', 'utf-8');

      // Add 7 entries
      for (let i = 0; i < 7; i++) {
        const entry: MemoryEntry = {
          key: `entry_${i}`,
          value: `Value ${i}`,
          timestamp: new Date(Date.now() - i * 1000).toISOString(),
          agent: 'claude-code',
        };
        await writeMemoryEntry(memoryPath, entry);
      }

      const context: HookContext = {
        sessionId: 'sess-123',
        agent: 'claude-code',
        project: 'test-project',
        projectRoot: testDir,
      };

      await injectSessionStartContext(context);

      const contextPath = join(kernelDir, '.session-context');
      const content = await fs.readFile(contextPath, 'utf-8');

      // Should contain newest entries (entry_0 through entry_4)
      expect(content).toContain('entry_0');
      expect(content).toContain('entry_1');
      expect(content).toContain('entry_4');
      // Should not contain oldest entry
      expect(content).not.toContain('entry_6');
    });
  });

  describe('SessionEnd → token logged', () => {
    it('should log session tokens to token-log.json', async () => {
      const kernelDir = join(testDir, '.kernel');
      const tokenLogPath = join(kernelDir, 'token-log.json');

      await fs.mkdir(kernelDir, { recursive: true });
      await fs.writeFile(tokenLogPath, '', 'utf-8');

      const sessionContent = 'This is a test session with some content to be tokenized.';
      const context: SessionEndContext = {
        sessionId: 'sess-123',
        agent: 'claude-code',
        project: 'test-project',
        projectRoot: testDir,
        sessionContent,
        model: 'gpt-3.5-turbo',
      };

      await logSessionTokens(context);

      // Verify token entry was logged
      const content = await fs.readFile(tokenLogPath, 'utf-8');
      expect(content.trim()).not.toBe('');

      // Verify it's valid NDJSON
      const entries = parseTokenLog(content);
      expect(entries.length).toBeGreaterThan(0);

      // Verify entry has correct fields
      const entry = entries[0];
      expect(entry.model).toBe('gpt-3.5-turbo');
      expect(entry.agent).toBe('claude-code');
      expect(entry.project).toBe('test-project');
      expect(entry.tokens).toBeGreaterThan(0);
      expect(entry.timestamp).toBeTruthy();
    });

    it('should append multiple token entries', async () => {
      const kernelDir = join(testDir, '.kernel');
      const tokenLogPath = join(kernelDir, 'token-log.json');

      await fs.mkdir(kernelDir, { recursive: true });
      await fs.writeFile(tokenLogPath, '', 'utf-8');

      // Log first session
      const context1: SessionEndContext = {
        sessionId: 'sess-1',
        agent: 'claude-code',
        project: 'project-a',
        projectRoot: testDir,
        sessionContent: 'First session content',
        model: 'gpt-3.5-turbo',
      };

      await logSessionTokens(context1);

      // Log second session
      const context2: SessionEndContext = {
        sessionId: 'sess-2',
        agent: 'codex',
        project: 'project-b',
        projectRoot: testDir,
        sessionContent: 'Second session content that is longer and has more tokens',
        model: 'gpt-4',
      };

      await logSessionTokens(context2);

      // Verify both entries are logged
      const content = await fs.readFile(tokenLogPath, 'utf-8');
      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(2);
      expect(entries[0].agent).toBe('claude-code');
      expect(entries[0].project).toBe('project-a');
      expect(entries[1].agent).toBe('codex');
      expect(entries[1].project).toBe('project-b');
    });

    it('should preserve all token entry fields correctly', async () => {
      const kernelDir = join(testDir, '.kernel');
      const tokenLogPath = join(kernelDir, 'token-log.json');

      await fs.mkdir(kernelDir, { recursive: true });
      await fs.writeFile(tokenLogPath, '', 'utf-8');

      const sessionContent = 'Token test: ' + 'x'.repeat(1000);
      const context: SessionEndContext = {
        sessionId: 'sess-integration',
        agent: 'claude-code',
        project: 'integration-test',
        projectRoot: testDir,
        sessionContent,
        model: 'claude-3-sonnet',
      };

      const beforeTime = new Date();
      await logSessionTokens(context);
      const afterTime = new Date();

      const content = await fs.readFile(tokenLogPath, 'utf-8');
      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(1);
      const entry = entries[0];

      // Verify all fields
      expect(entry.model).toBe('claude-3-sonnet');
      expect(entry.agent).toBe('claude-code');
      expect(entry.project).toBe('integration-test');
      expect(entry.tokens).toBeGreaterThan(0);

      // Verify timestamp is reasonable
      const timestamp = new Date(entry.timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime() - 100);
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 100);
    });
  });

  describe('MCP memory handler → search and add', () => {
    it('should add and retrieve memory entries', async () => {
      const kernelDir = join(testDir, '.kernel');
      const memoryPath = join(kernelDir, 'MEMORY.md');

      await fs.mkdir(kernelDir, { recursive: true });
      await fs.writeFile(memoryPath, '# Project Memory\n\n', 'utf-8');

      const handler = new MemoryHandler(memoryPath);

      // Add entries
      await handler.add('database_type', 'PostgreSQL', 'claude-code');
      await handler.add('api_framework', 'Express.js', 'codex');
      await handler.add('frontend_framework', 'React', 'claude-code');

      // Verify entries exist by reading file directly
      const entries = await readMemoryFile(memoryPath);
      expect(entries).toHaveLength(3);

      // Verify search finds entries
      const results = await handler.search('database');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].key).toBe('database_type');
    });

    it('should search and rank by recency and relevance', async () => {
      const kernelDir = join(testDir, '.kernel');
      const memoryPath = join(kernelDir, 'MEMORY.md');

      await fs.mkdir(kernelDir, { recursive: true });
      await fs.writeFile(memoryPath, '# Project Memory\n\n', 'utf-8');

      const handler = new MemoryHandler(memoryPath);

      // Add entries with timestamps
      // Older entries first
      await new Promise((resolve) => setTimeout(resolve, 100));
      await handler.add('old_config', 'Old database config', 'agent-1');

      await new Promise((resolve) => setTimeout(resolve, 100));
      await handler.add('current_config', 'Current database settings', 'agent-2');

      await new Promise((resolve) => setTimeout(resolve, 100));
      await handler.add('latest_config', 'Latest database configuration', 'agent-3');

      // Search for "config"
      const results = await handler.search('config');

      expect(results.length).toBeGreaterThanOrEqual(2);

      // Should be ranked by timestamp (newest first)
      // latest_config should appear before old_config due to recency
      const keyOrder = results.map((r) => r.key);
      const latestIndex = keyOrder.indexOf('latest_config');
      const oldIndex = keyOrder.indexOf('old_config');

      if (latestIndex !== -1 && oldIndex !== -1) {
        expect(latestIndex).toBeLessThan(oldIndex);
      }
    });

    it('should find entries by exact key match with highest score', async () => {
      const kernelDir = join(testDir, '.kernel');
      const memoryPath = join(kernelDir, 'MEMORY.md');

      await fs.mkdir(kernelDir, { recursive: true });
      await fs.writeFile(memoryPath, '# Project Memory\n\n', 'utf-8');

      const handler = new MemoryHandler(memoryPath);

      // Add entries with overlapping keys
      await handler.add('database', 'Main database config', 'agent-1');
      await handler.add('database_primary', 'Primary database', 'agent-2');
      await handler.add('database_backup', 'Backup database', 'agent-3');

      // Search for exact key "database"
      const results = await handler.search('database');

      expect(results.length).toBeGreaterThan(0);

      // First result should be exact key match "database" (score 1.0)
      const exactMatch = results.find((r) => r.key === 'database');
      expect(exactMatch).toBeTruthy();
      if (exactMatch) {
        expect(exactMatch.score).toBe(1.0);
      }
    });

    it('should return empty results for non-existent keywords', async () => {
      const kernelDir = join(testDir, '.kernel');
      const memoryPath = join(kernelDir, 'MEMORY.md');

      await fs.mkdir(kernelDir, { recursive: true });
      await fs.writeFile(memoryPath, '# Project Memory\n\n', 'utf-8');

      const handler = new MemoryHandler(memoryPath);

      // Add some entries
      await handler.add('config_one', 'Some value', 'agent-1');
      await handler.add('config_two', 'Another value', 'agent-2');

      // Search for non-existent keyword
      const results = await handler.search('nonexistent');

      expect(results).toEqual([]);
    });
  });

  describe('Config persistence', () => {
    it('should save and load config with all fields preserved', async () => {
      const kernelDir = join(testDir, '.kernel');
      const configPath = join(kernelDir, 'kernel.json');

      await fs.mkdir(kernelDir, { recursive: true });

      const originalConfig: KernelConfig = {
        mode: 'full',
        memoryBackend: 'sqlite',
        version: '1.5.0',
        projectRoot: '/my/project/path',
      };

      // Save config
      await saveConfig(configPath, originalConfig);

      // Load config
      const loadedConfig = await loadConfig(configPath);

      // Verify all fields preserved
      expect(loadedConfig.mode).toBe('full');
      expect(loadedConfig.memoryBackend).toBe('sqlite');
      expect(loadedConfig.version).toBe('1.5.0');
      expect(loadedConfig.projectRoot).toBe('/my/project/path');
    });

    it('should handle config modification and reloading', async () => {
      const kernelDir = join(testDir, '.kernel');
      const configPath = join(kernelDir, 'kernel.json');

      await fs.mkdir(kernelDir, { recursive: true });

      // Initial config
      const config1: KernelConfig = {
        mode: 'bare',
        memoryBackend: 'file',
        version: '1.0.0',
        projectRoot: testDir,
      };

      await saveConfig(configPath, config1);

      // Load and verify initial state
      let loaded = await loadConfig(configPath);
      expect(loaded.mode).toBe('bare');
      expect(loaded.memoryBackend).toBe('file');

      // Modify config
      const config2: KernelConfig = {
        ...loaded,
        mode: 'full',
        memoryBackend: 'sqlite',
      };

      await saveConfig(configPath, config2);

      // Load and verify changes
      loaded = await loadConfig(configPath);
      expect(loaded.mode).toBe('full');
      expect(loaded.memoryBackend).toBe('sqlite');
    });

    it('should return default config for invalid or missing files', async () => {
      const nonexistentPath = join(testDir, 'nonexistent', 'kernel.json');

      const config = await loadConfig(nonexistentPath);

      // Should return DEFAULT_CONFIG
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should handle corrupted config gracefully', async () => {
      const kernelDir = join(testDir, '.kernel');
      const configPath = join(kernelDir, 'kernel.json');

      await fs.mkdir(kernelDir, { recursive: true });

      // Write invalid JSON
      await fs.writeFile(configPath, 'invalid json {', 'utf-8');

      const config = await loadConfig(configPath);

      // Should return DEFAULT_CONFIG instead of crashing
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should handle partially valid config (missing fields)', async () => {
      const kernelDir = join(testDir, '.kernel');
      const configPath = join(kernelDir, 'kernel.json');

      await fs.mkdir(kernelDir, { recursive: true });

      // Write config missing required fields
      const partial = { mode: 'bare' };
      await fs.writeFile(configPath, JSON.stringify(partial), 'utf-8');

      const config = await loadConfig(configPath);

      // Should return DEFAULT_CONFIG for partial data
      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('Full multi-component workflow integration', () => {
    it('should perform complete init → memory → session lifecycle', async () => {
      const kernelDir = join(testDir, '.kernel');
      const configPath = join(kernelDir, 'kernel.json');
      const memoryPath = join(kernelDir, 'MEMORY.md');
      const tokenLogPath = join(kernelDir, 'token-log.json');
      const contextPath = join(kernelDir, '.session-context');

      // Step 1: Initialize kernel (CLI init simulation)
      await fs.mkdir(kernelDir, { recursive: true });

      const config: KernelConfig = {
        ...DEFAULT_CONFIG,
        mode: 'bare',
        projectRoot: testDir,
      };
      await saveConfig(configPath, config);
      await fs.writeFile(memoryPath, '# Project Memory\n\n', 'utf-8');
      await fs.writeFile(tokenLogPath, '', 'utf-8');

      // Verify init completed
      let configExists = await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false);
      expect(configExists).toBe(true);

      // Step 2: Add memory entries
      const handler = new MemoryHandler(memoryPath);
      await handler.add('architecture', 'Microservices with Docker', 'claude-code');
      await handler.add('deployment', 'Kubernetes on AWS', 'claude-code');

      const memoryEntries = await readMemoryFile(memoryPath);
      expect(memoryEntries.length).toBeGreaterThanOrEqual(2);

      // Step 3: Session start - inject context
      const sessionStartContext: HookContext = {
        sessionId: 'full-workflow-1',
        agent: 'claude-code',
        project: 'integration-test',
        projectRoot: testDir,
      };

      await injectSessionStartContext(sessionStartContext);

      const contextExists = await fs
        .access(contextPath)
        .then(() => true)
        .catch(() => false);
      expect(contextExists).toBe(true);

      const injectedContext = await fs.readFile(contextPath, 'utf-8');
      expect(injectedContext).toContain('Project Context');

      // Step 4: Session end - log tokens
      const sessionContent = 'Session work content. ' + 'x'.repeat(500);
      const sessionEndContext: SessionEndContext = {
        ...sessionStartContext,
        sessionContent,
        model: 'gpt-3.5-turbo',
      };

      await logSessionTokens(sessionEndContext);

      // Step 5: Verify token logging
      const tokenContent = await fs.readFile(tokenLogPath, 'utf-8');
      const entries = parseTokenLog(tokenContent);

      expect(entries).toHaveLength(1);
      const entry = entries[0];
      expect(entry.agent).toBe('claude-code');
      expect(entry.model).toBe('gpt-3.5-turbo');
      expect(entry.tokens).toBeGreaterThan(0);

      // Verify all files exist
      const allFilesExist = await Promise.all([
        fs
          .access(configPath)
          .then(() => true)
          .catch(() => false),
        fs
          .access(memoryPath)
          .then(() => true)
          .catch(() => false),
        fs
          .access(tokenLogPath)
          .then(() => true)
          .catch(() => false),
        fs
          .access(contextPath)
          .then(() => true)
          .catch(() => false),
      ]);

      expect(allFilesExist).toEqual([true, true, true, true]);
    });

    it('should handle multiple sessions with memory and token tracking', async () => {
      const kernelDir = join(testDir, '.kernel');
      const configPath = join(kernelDir, 'kernel.json');
      const memoryPath = join(kernelDir, 'MEMORY.md');
      const tokenLogPath = join(kernelDir, 'token-log.json');

      // Initialize
      await fs.mkdir(kernelDir, { recursive: true });
      const config: KernelConfig = {
        ...DEFAULT_CONFIG,
        mode: 'full',
        projectRoot: testDir,
      };
      await saveConfig(configPath, config);
      await fs.writeFile(memoryPath, '# Project Memory\n\n', 'utf-8');
      await fs.writeFile(tokenLogPath, '', 'utf-8');

      const handler = new MemoryHandler(memoryPath);

      // Simulate multiple sessions
      for (let i = 1; i <= 3; i++) {
        // Add memory for this session
        await handler.add(`session_${i}_config`, `Configuration for session ${i}`, 'claude-code');

        // Log session tokens
        const context: SessionEndContext = {
          sessionId: `sess-${i}`,
          agent: 'claude-code',
          project: 'multi-session-test',
          projectRoot: testDir,
          sessionContent: `Session ${i} content with varying amounts of text. ` + 'x'.repeat(i * 100),
          model: 'gpt-3.5-turbo',
        };

        await logSessionTokens(context);
      }

      // Verify all sessions are logged
      const tokenContent = await fs.readFile(tokenLogPath, 'utf-8');
      const tokenEntries = parseTokenLog(tokenContent);

      expect(tokenEntries).toHaveLength(3);
      expect(tokenEntries[0].tokens).toBeLessThan(tokenEntries[1].tokens);
      expect(tokenEntries[1].tokens).toBeLessThan(tokenEntries[2].tokens);

      // Verify memory entries exist
      const memoryEntries = await readMemoryFile(memoryPath);
      expect(memoryEntries.length).toBeGreaterThanOrEqual(3);

      // Search should find session configs
      const searchResults = await handler.search('session');
      expect(searchResults.length).toBeGreaterThanOrEqual(3);
    });
  });
});
