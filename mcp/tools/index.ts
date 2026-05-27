// mcp/tools/index.ts
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { readTools } from './read';

export type MartrelloTool = {
  definition: Tool;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
};

export const tools: MartrelloTool[] = [
  ...readTools,
];

export function findTool(name: string): MartrelloTool | undefined {
  return tools.find((t) => t.definition.name === name);
}
