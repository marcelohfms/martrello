// mcp/tools/sprint.ts
import { getDb } from '@/lib/db/client';
import { startSprint, addToSprint, moveInSprint, removeFromSprint, closeSprint } from '@/lib/core/sprint';
import type { MartrelloTool } from './index';

export const sprintTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_start_sprint',
      description: 'Inicia uma nova sprint ativa. Erro se já houver uma ativa.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'auto-gerado se omitido' } },
      },
    },
    handler: async (input) => startSprint(getDb(), input.name as string | undefined),
  },
  {
    definition: {
      name: 'martrello_add_to_sprint',
      description: 'Adiciona card à sprint ativa (default: backlog). Idempotente.',
      inputSchema: {
        type: 'object',
        required: ['card_id'],
        properties: {
          card_id: { type: 'string' },
          sprint_list: { type: 'string', enum: ['backlog', 'doing', 'done'], default: 'backlog' },
        },
      },
    },
    handler: async (input) => addToSprint(getDb(), String(input.card_id), (input.sprint_list as any) ?? 'backlog'),
  },
  {
    definition: {
      name: 'martrello_move_in_sprint',
      description: 'Move card entre colunas do sprint.',
      inputSchema: {
        type: 'object',
        required: ['card_id', 'sprint_list'],
        properties: {
          card_id: { type: 'string' },
          sprint_list: { type: 'string', enum: ['backlog', 'doing', 'done'] },
          position: { type: 'integer' },
        },
      },
    },
    handler: async (input) => {
      await moveInSprint(getDb(), String(input.card_id), input.sprint_list as any, input.position as number | undefined);
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_remove_from_sprint',
      description: 'Tira card da sprint (continua existindo no projeto).',
      inputSchema: {
        type: 'object',
        required: ['card_id'],
        properties: { card_id: { type: 'string' } },
      },
    },
    handler: async (input) => {
      await removeFromSprint(getDb(), String(input.card_id));
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_close_sprint',
      description: 'Fecha sprint ativa. Cards "done" são arquivados. Por padrão (carry_incomplete=true), incompletos carregam para nova sprint, mantendo a coluna de origem.',
      inputSchema: {
        type: 'object',
        properties: {
          name_for_next: { type: 'string' },
          carry_incomplete: { type: 'boolean', default: true },
        },
      },
    },
    handler: async (input) => closeSprint(getDb(), {
      nameForNext: input.name_for_next as string | undefined,
      carryIncomplete: input.carry_incomplete as boolean | undefined,
    }),
  },
];
