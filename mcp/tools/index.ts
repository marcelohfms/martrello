// mcp/tools/index.ts
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export type MartrelloTool = {
  definition: Tool;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
};

export const tools: MartrelloTool[] = [];

export function findTool(name: string): MartrelloTool | undefined {
  return tools.find((t) => t.definition.name === name);
}
