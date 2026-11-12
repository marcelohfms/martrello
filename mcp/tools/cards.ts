// mcp/tools/cards.ts
import { getDb } from '@/lib/db/client';
import { createCard, updateCard, moveCard, archiveCard, unarchiveCard, getCardById } from '@/lib/core/cards';
import type { MartrelloTool } from './index';

export const cardTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_create_card',
      description: 'Cria um card. list default = Backlog. Fora do Backlog o card precisa de responsável: fica com quem chama. due_date aceita ISO ou pt-BR (hoje, amanhã, sex, +3d, etc).',
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
        },
      },
    },
    handler: async (input, { actor }) => createCard(getDb(), actor, {
      project: String(input.project),
      list: input.list as string | undefined,
      title: String(input.title),
      description: input.description as string | undefined,
      dueDate: input.due_date as string | undefined,
      labels: input.labels as string[] | undefined,
    }),
  },
  {
    definition: {
      name: 'martrello_get_card',
      description: 'Retorna um card com suas labels, responsável e dependências.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: async (input, { actor }) => getCardById(getDb(), actor, String(input.id)),
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
    handler: async (input, { actor }) => updateCard(getDb(), actor, String(input.id), {
      title: input.title as string | undefined,
      description: input.description as string | null | undefined,
      dueDate: input.due_date as string | null | undefined,
    }),
  },
  {
    definition: {
      name: 'martrello_move_card',
      description: 'Move card pra outra list (e opcionalmente outro projeto). Sair do Backlog sem responsável atribui o card a quem chama. Ir para Feito ignora position.',
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
    handler: async (input, { actor }) => {
      await moveCard(getDb(), actor, String(input.id), {
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
    handler: async (input, { actor }) => {
      await archiveCard(getDb(), actor, String(input.id));
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
    handler: async (input, { actor }) => {
      await unarchiveCard(getDb(), actor, String(input.id));
      return { ok: true };
    },
  },
];
