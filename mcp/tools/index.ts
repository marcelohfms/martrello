// mcp/tools/index.ts
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { readTools } from './read';
import { projectTools } from './projects';
import { listTools } from './lists';
import { labelTools } from './labels';

export type MartrelloTool = {
  definition: Tool;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
};

export const tools: MartrelloTool[] = [
  ...readTools,
  ...projectTools,
  ...listTools,
  ...labelTools,
];

export function findTool(name: string): MartrelloTool | undefined {
  return tools.find((t) => t.definition.name === name);
}
