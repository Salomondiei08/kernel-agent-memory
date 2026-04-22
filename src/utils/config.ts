import { promises as fs } from 'fs';
import { dirname } from 'path';

/**
 * Configuration for the Kernel system
 */
export interface KernelConfig {
  mode: 'bare' | 'full';
  memoryBackend: 'file' | 'sqlite';
  version: string;
  projectRoot: string;
}

/**
 * Default kernel configuration
 */
export const DEFAULT_CONFIG: KernelConfig = {
  mode: 'bare',
  memoryBackend: 'file',
  version: '0.0.1',
  projectRoot: process.cwd(),
};

/**
 * Loads kernel configuration from a JSON file
 * Returns DEFAULT_CONFIG if the file is missing or cannot be parsed
 *
 * @param configPath - Path to the kernel.json configuration file
 * @returns Parsed KernelConfig or DEFAULT_CONFIG if unavailable
 */
export async function loadConfig(configPath: string): Promise<KernelConfig> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config: unknown = JSON.parse(content);

    // Validate that the parsed config has the required fields
    if (
      typeof config === 'object' &&
      config !== null &&
      'mode' in config &&
      'memoryBackend' in config &&
      'version' in config &&
      'projectRoot' in config
    ) {
      // Return only the required fields, stripping any extra fields
      return {
        mode: (config as Record<string, unknown>).mode as 'bare' | 'full',
        memoryBackend: (config as Record<string, unknown>).memoryBackend as 'file' | 'sqlite',
        version: (config as Record<string, unknown>).version as string,
        projectRoot: (config as Record<string, unknown>).projectRoot as string,
      };
    }

    // If validation fails, return default config
    return DEFAULT_CONFIG;
  } catch {
    // Return default config for any errors (file not found, parse errors, etc.)
    return DEFAULT_CONFIG;
  }
}

/**
 * Saves kernel configuration to a JSON file
 * Creates parent directories recursively if they don't exist
 *
 * @param configPath - Path where the kernel.json file should be written
 * @param config - KernelConfig object to save
 */
export async function saveConfig(configPath: string, config: KernelConfig): Promise<void> {
  // Ensure parent directory exists
  const dir = dirname(configPath);
  await fs.mkdir(dir, { recursive: true });

  // Write configuration as formatted JSON with 2-space indentation
  const content = JSON.stringify(config, null, 2);
  await fs.writeFile(configPath, content, 'utf-8');
}
