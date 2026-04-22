import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { loadConfig, saveConfig, DEFAULT_CONFIG, KernelConfig } from '../../src/utils/config';

const testDir = join(process.cwd(), '.test-config');

describe('config', () => {
  beforeEach(async () => {
    // Create test directory
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

  describe('saveConfig', () => {
    it('creates kernel.json with formatted JSON', async () => {
      const configPath = join(testDir, 'kernel.json');
      const config: KernelConfig = {
        mode: 'full',
        memoryBackend: 'sqlite',
        version: '0.0.2',
        projectRoot: '/home/user/project',
      };

      await saveConfig(configPath, config);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed).toEqual(config);
      // Verify 2-space indentation by checking for newlines and spaces
      expect(content).toContain('\n  "mode"');
    });

    it('creates parent directories recursively', async () => {
      const configPath = join(testDir, 'deep', 'nested', 'path', 'kernel.json');
      const config: KernelConfig = {
        mode: 'bare',
        memoryBackend: 'file',
        version: '0.0.1',
        projectRoot: process.cwd(),
      };

      await saveConfig(configPath, config);

      const exists = await fs
        .stat(configPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('overwrites existing kernel.json', async () => {
      const configPath = join(testDir, 'kernel.json');
      const config1: KernelConfig = {
        mode: 'bare',
        memoryBackend: 'file',
        version: '0.0.1',
        projectRoot: '/path1',
      };
      const config2: KernelConfig = {
        mode: 'full',
        memoryBackend: 'sqlite',
        version: '0.0.2',
        projectRoot: '/path2',
      };

      await saveConfig(configPath, config1);
      await saveConfig(configPath, config2);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed).toEqual(config2);
    });
  });

  describe('loadConfig', () => {
    it('reads and parses existing kernel.json correctly', async () => {
      const configPath = join(testDir, 'kernel.json');
      const config: KernelConfig = {
        mode: 'full',
        memoryBackend: 'sqlite',
        version: '0.0.2',
        projectRoot: '/home/user/project',
      };

      await saveConfig(configPath, config);
      const loaded = await loadConfig(configPath);

      expect(loaded).toEqual(config);
    });

    it('returns DEFAULT_CONFIG for missing file', async () => {
      const configPath = join(testDir, 'nonexistent', 'kernel.json');
      const loaded = await loadConfig(configPath);

      expect(loaded).toEqual(DEFAULT_CONFIG);
    });

    it('returns DEFAULT_CONFIG for invalid JSON', async () => {
      const configPath = join(testDir, 'kernel.json');
      await fs.writeFile(configPath, 'not valid json{]', 'utf-8');

      const loaded = await loadConfig(configPath);

      expect(loaded).toEqual(DEFAULT_CONFIG);
    });

    it('returns DEFAULT_CONFIG for JSON missing required fields', async () => {
      const configPath = join(testDir, 'kernel.json');
      const invalidConfig = { mode: 'bare' }; // Missing other fields

      await fs.writeFile(configPath, JSON.stringify(invalidConfig), 'utf-8');

      const loaded = await loadConfig(configPath);

      expect(loaded).toEqual(DEFAULT_CONFIG);
    });

    it('gracefully handles JSON with extra fields', async () => {
      const configPath = join(testDir, 'kernel.json');
      const config: KernelConfig = {
        mode: 'bare',
        memoryBackend: 'file',
        version: '0.0.1',
        projectRoot: '/home/user/project',
      };
      const extraFields = {
        ...config,
        extra: 'field',
        another: 123,
      };

      await fs.writeFile(configPath, JSON.stringify(extraFields), 'utf-8');

      const loaded = await loadConfig(configPath);

      expect(loaded).toEqual(config);
    });
  });

  describe('round-trip consistency', () => {
    it('preserves all config fields through save and load', async () => {
      const configPath = join(testDir, 'kernel.json');
      const config: KernelConfig = {
        mode: 'full',
        memoryBackend: 'sqlite',
        version: '1.2.3',
        projectRoot: '/path/to/project',
      };

      await saveConfig(configPath, config);
      const loaded = await loadConfig(configPath);

      expect(loaded).toEqual(config);
      expect(loaded.mode).toBe(config.mode);
      expect(loaded.memoryBackend).toBe(config.memoryBackend);
      expect(loaded.version).toBe(config.version);
      expect(loaded.projectRoot).toBe(config.projectRoot);
    });

    it('handles multiple round-trips correctly', async () => {
      const configPath = join(testDir, 'kernel.json');
      const configs: KernelConfig[] = [
        { mode: 'bare', memoryBackend: 'file', version: '0.0.1', projectRoot: '/a' },
        { mode: 'full', memoryBackend: 'sqlite', version: '0.1.0', projectRoot: '/b' },
        { mode: 'bare', memoryBackend: 'sqlite', version: '0.2.0', projectRoot: '/c' },
      ];

      for (const config of configs) {
        await saveConfig(configPath, config);
        const loaded = await loadConfig(configPath);
        expect(loaded).toEqual(config);
      }
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('has correct default values', () => {
      expect(DEFAULT_CONFIG.mode).toBe('bare');
      expect(DEFAULT_CONFIG.memoryBackend).toBe('file');
      expect(DEFAULT_CONFIG.version).toBe('0.0.1');
      expect(typeof DEFAULT_CONFIG.projectRoot).toBe('string');
    });

    it('projectRoot defaults to process.cwd()', () => {
      expect(DEFAULT_CONFIG.projectRoot).toBe(process.cwd());
    });
  });
});
