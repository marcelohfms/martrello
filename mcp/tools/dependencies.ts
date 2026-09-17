// mcp/tools/dependencies.ts
import { getDb } from '@/lib/db/client';
import { addDependency, removeDependency } from '@/lib/core/dependencies';
import type { MartrelloTool } from './index';

export const dependencyTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_add_dependency',
      description:
        'Marca que um card depende de (é bloqueado por) outro card do mesmo projeto. Rejeita ciclos e dependências entre projetos diferentes.',
      inputSchema: {
        type: 'object',
        required: ['card_id', 'blocker_card_id'],
        properties: {
          card_id: { type: 'string', description: 'card que fica bloqueado' },
          blocker_card_id: { type: 'string', description: 'card pré-requisito' },
        },
      },
    },
    handler: async (input) => addDependency(getDb(), String(input.card_id), String(input.blocker_card_id)),
  },
  {
    definition: {
      name: 'martrello_remove_dependency',
      description: 'Remove uma dependência entre dois cards. Idempotente.',
      inputSchema: {
        type: 'object',
        required: ['card_id', 'blocker_card_id'],
        properties: {
          card_id: { type: 'string' },
          blocker_card_id: { type: 'string' },
        },
      },
    },
    handler: async (input) => {
      await removeDependency(getDb(), String(input.card_id), String(input.blocker_card_id));
      return { ok: true };
    },
  },
];
