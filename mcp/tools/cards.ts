// mcp/tools/cards.ts
import { getDb } from '@/lib/db/client';
import { createCard, updateCard, moveCard, archiveCard, unarchiveCard, getCardById } from '@/lib/core/cards';
import type { MartrelloTool } from './index';

export const cardTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_create_card',
      description: 'Cria um card. list default = primeira do projeto. due_date aceita ISO ou pt-BR (hoje, amanhã, sex, +3d, etc).',
      inputSchema: {
        type: 'object',
        required: ['project', 'title'],
        properties: {
          project: { type: 'string' },
          list: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string', description: 'markdown' },
          due_date: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' }, description: 'nomes de labels existentes' },
          add_to_sprint: { type: 'boolean', default: false },
        },
      },
    },
    handler: async (input) => createCard(getDb(), {
      project: String(input.project),
      list: input.list as string | undefined,
      title: String(input.title),
      description: input.description as string | undefined,
      dueDate: input.due_date as string | undefined,
      labels: input.labels as string[] | undefined,
      addToSprint: Boolean(input.add_to_sprint),
    }),
  },
  {
    definition: {
      name: 'martrello_get_card',
      description: 'Retorna um card com suas labels.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: async (input) => getCardById(getDb(), String(input.id)),
  },
  {
    definition: {
      name: 'martrello_update_card',
      description: 'Atualiza title, description, e/ou due_date.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: ['string', 'null'] },
          due_date: { type: ['string', 'null'] },
        },
      },
    },
    handler: async (input) => updateCard(getDb(), String(input.id), {
      title: input.title as string | undefined,
      description: input.description as string | null | undefined,
      dueDate: input.due_date as string | null | undefined,
    }),
  },
  {
    definition: {
      name: 'martrello_move_card',
      description: 'Move card pra outra list (e opcionalmente outro projeto).',
      inputSchema: {
        type: 'object',
        required: ['id', 'to_list'],
        properties: {
          id: { type: 'string' },
          to_project: { type: 'string' },
          to_list: { type: 'string' },
          position: { type: 'integer' },
        },
      },
    },
    handler: async (input) => {
      await moveCard(getDb(), String(input.id), {
        toProject: input.to_project as string | undefined,
        toList: String(input.to_list),
        position: input.position as number | undefined,
      });
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_archive_card',
      description: 'Arquiva card (sai do sprint automaticamente).',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: async (input) => {
      await archiveCard(getDb(), String(input.id));
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_unarchive_card',
      description: 'Desarquiva card. Não restaura no sprint.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: async (input) => {
      await unarchiveCard(getDb(), String(input.id));
      return { ok: true };
    },
  },
];
