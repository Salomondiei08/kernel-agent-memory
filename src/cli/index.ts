#!/usr/bin/env node

import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import { saveConfig, DEFAULT_CONFIG, type KernelConfig } from '../utils/config.js';

/**
 * Parse command-line arguments
 */
function parseArgs(args: string[]): {
  command?: string;
  mode?: 'bare' | 'full';
  projectRoot?: string;
} {
  const parsed: {
    command?: string;
    mode?: 'bare' | 'full';
    projectRoot?: string;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      parsed.command = 'help';
    } else if (arg === 'init') {
      parsed.command = 'init';
    } else if (arg === '--mode') {
      const mode = args[i + 1] as 'bare' | 'full';
      if (mode === 'bare' || mode === 'full') {
        parsed.mode = mode;
        i++; // Skip the next argument as we've consumed it
      }
    }
  }

  return parsed;
}

/**
 * Create MCP configuration file in project root
 */
async function createMcpConfig(projectRoot: string, kernelServerPath: string): Promise<void> {
  const mcpConfigPath = resolve(projectRoot, '.mcp.json');
  const mcpConfig = {
    mcpServers: {
      kernel: {
        command: 'node',
        args: [kernelServerPath],
        env: {
          KERNEL_PROJECT_ROOT: projectRoot,
        },
      },
    },
  };

  await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
  console.log('✓ Created .mcp.json (Claude Code registered)');
}

/**
 * Initialize kernel in the current project
 * Creates .kernel directory with kernel.json, MEMORY.md, and token-log.json
 * Also creates .mcp.json for Claude Code integration
 */
async function initKernel(options: {
  mode: 'bare' | 'full';
  projectRoot?: string;
}): Promise<void> {
  const projectRoot = options.projectRoot || process.cwd();
  const kernelDir = resolve(projectRoot, '.kernel');
  const configPath = resolve(kernelDir, 'kernel.json');
  const memoryPath = resolve(kernelDir, 'MEMORY.md');
  const tokenLogPath = resolve(kernelDir, 'token-log.json');

  try {
    // Create .kernel directory
    await fs.mkdir(kernelDir, { recursive: true });
    console.log('✓ Created .kernel directory');

    // Create and save kernel.json
    const config: KernelConfig = {
      ...DEFAULT_CONFIG,
      mode: options.mode,
      projectRoot,
    };
    await saveConfig(configPath, config);
    console.log('✓ Created kernel.json');

    // Create MEMORY.md with initial content
    const memoryContent = '# Project Memory\n\n';
    await fs.writeFile(memoryPath, memoryContent, 'utf-8');
    console.log('✓ Created MEMORY.md');

    // Create token-log.json as empty file
    const tokenLogContent = '';
    await fs.writeFile(tokenLogPath, tokenLogContent, 'utf-8');
    console.log('✓ Created token-log.json');

    // Create .mcp.json with MCP server configuration
    // Runtime: src/cli/index.ts is at dist/src/cli/index.js
    // Server is at dist/src/mcp/server.js, so go up one level from cli/ to src/
    const cliDir = dirname(new URL(import.meta.url).pathname);
    const kernelServerPath = resolve(cliDir, '../mcp/server.js');
    await createMcpConfig(projectRoot, kernelServerPath);

    console.log('\n✓ Kernel initialized successfully!');
    console.log(`\nMode: ${options.mode}`);
    console.log(`Project root: ${projectRoot}`);
    console.log(`\nNext steps:`);
    console.log(`1. Restart Claude Code (cmd+q, then reopen)`);
    console.log(`2. Open this project in Claude Code`);
    console.log(`3. Start using: kernel.memory.add("key", "value")`);
    console.log(`4. Memory auto-injects on next session`);
  } catch (error) {
    console.error('✗ Failed to initialize kernel:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Display help text
 */
function showHelp(): void {
  console.log(`Kernel CLI

Usage:
  kernel <command> [options]

Commands:
  init [--mode bare|full]  Initialize a new kernel project (default: bare mode)
  --help, -h              Show this help message

Examples:
  kernel init
  kernel init --mode full
  kernel --help
`);
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const parsed = parseArgs(args);

  if (parsed.command === 'help') {
    showHelp();
    process.exit(0);
  }

  if (parsed.command === 'init') {
    const mode = parsed.mode || 'bare';
    await initKernel({ mode, projectRoot: parsed.projectRoot });
    process.exit(0);
  }

  console.error('✗ Unknown command. Use "kernel --help" for usage information.');
  process.exit(1);
}

main().catch((error) => {
  console.error('✗ Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
