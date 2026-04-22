import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MemoryHandler } from './memory-handler.js';

/**
 * MCP server with memory operations
 * Exposes three tools: memory.add, memory.search, memory.read
 */
export class MemoryServer {
  private server: McpServer;
  private handler: MemoryHandler;

  constructor(memoryPath: string) {
    this.server = new McpServer({
      name: 'kernel-memory',
      version: '0.0.1',
    });

    this.handler = new MemoryHandler(memoryPath);
    this.setupTools();
  }

  /**
   * Registers the three memory tools with the server
   */
  private setupTools(): void {
    // Tool: memory.add
    this.server.registerTool(
      'memory.add',
      {
        description: 'Add a new memory entry with key, value, agent, and optional metadata',
        inputSchema: {
          key: z.string().describe('The memory key identifier'),
          value: z.string().describe('The memory value/content'),
          agent: z.string().describe('The agent name storing this entry'),
        },
      },
      async ({ key, value, agent }) => {
        await this.handler.add(key, value, agent);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `Memory entry added: ${key}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: memory.search
    this.server.registerTool(
      'memory.search',
      {
        description: 'Search memory entries by query, returns ranked results by recency and relevance',
        inputSchema: {
          query: z.string().describe('Search query string'),
        },
      },
      async ({ query }) => {
        const results = await this.handler.search(query);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  count: results.length,
                  results,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // Tool: memory.read
    this.server.registerTool(
      'memory.read',
      {
        description: 'Read a single memory entry by exact key match',
        inputSchema: {
          key: z.string().describe('The exact memory key to look up'),
        },
      },
      async ({ key }) => {
        const entry = await this.handler.read(key);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  entry: entry || null,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );
  }

  /**
   * Starts the server with stdio transport
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
