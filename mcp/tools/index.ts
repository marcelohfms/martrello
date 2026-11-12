// mcp/tools/index.ts
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Actor } from '@/lib/access/actor';
import { readTools } from './read';
import { projectTools } from './projects';
import { labelTools } from './labels';
import { cardTools } from './cards';
import { dependencyTools } from './dependencies';

/** Who is calling: every tool acts on behalf of this actor. */
export type ToolCtx = { actor: Actor };

export type MartrelloTool = {
  definition: Tool;
  handler: (input: Record<string, unknown>, ctx: ToolCtx) => Promise<unknown>;
};

export const tools: MartrelloTool[] = [
  ...readTools,
  ...projectTools,
  ...labelTools,
  ...cardTools,
  ...dependencyTools,
];

export function findTool(name: string): MartrelloTool | undefined {
  return tools.find((t) => t.definition.name === name);
}
