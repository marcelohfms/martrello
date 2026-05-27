// mcp/tools/lists.ts
import { getDb } from '@/lib/db/client';
import { getProjectByNameOrId } from '@/lib/core/projects';
import { createList, renameList, deleteList, reorderLists, getListByNameOrId } from '@/lib/core/lists';
import type { MartrelloTool } from './index';

export const listTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_create_list',
      description: 'Cria uma lista (coluna) num projeto. Default na última posição.',
      inputSchema: {
        type: 'object',
        required: ['project', 'name'],
        properties: {
          project: { type: 'string' },
          name: { type: 'string' },
          position: { type: 'integer' },
        },
      },
    },
    handler: async (input) => {
      const db = getDb();
      const p = await getProjectByNameOrId(db, String(input.project));
      return createList(db, p.id, String(input.name), input.position as number | undefined);
    },
  },
  {
    definition: {
      name: 'martrello_rename_list',
      description: 'Renomeia uma lista (passa name ou id).',
      inputSchema: {
        type: 'object',
        required: ['project', 'list', 'new_name'],
        properties: {
          project: { type: 'string' },
          list: { type: 'string' },
          new_name: { type: 'string' },
        },
      },
    },
    handler: async (input) => {
      const db = getDb();
      const p = await getProjectByNameOrId(db, String(input.project));
      const l = await getListByNameOrId(db, p.id, String(input.list));
      return renameList(db, l.id, String(input.new_name));
    },
  },
  {
    definition: {
      name: 'martrello_delete_list',
      description: 'Deleta lista. Se tiver cards, exige force=true.',
      inputSchema: {
        type: 'object',
        required: ['project', 'list'],
        properties: {
          project: { type: 'string' },
          list: { type: 'string' },
          force: { type: 'boolean', default: false },
        },
      },
    },
    handler: async (input) => {
      const db = getDb();
      const p = await getProjectByNameOrId(db, String(input.project));
      const l = await getListByNameOrId(db, p.id, String(input.list));
      await deleteList(db, l.id, { force: Boolean(input.force) });
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_reorder_lists',
      description: 'Reordena listas de um projeto.',
      inputSchema: {
        type: 'object',
        required: ['project', 'ordered'],
        properties: {
          project: { type: 'string' },
          ordered: { type: 'array', items: { type: 'string' }, description: 'nomes ou ids' },
        },
      },
    },
    handler: async (input) => {
      const db = getDb();
      const p = await getProjectByNameOrId(db, String(input.project));
      const orderedIds: string[] = [];
      for (const n of (input.ordered as string[]) ?? []) {
        const l = await getListByNameOrId(db, p.id, n);
        orderedIds.push(l.id);
      }
      await reorderLists(db, p.id, orderedIds);
      return { ok: true };
    },
  },
];
