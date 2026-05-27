// mcp/tools/projects.ts
import { getDb } from '@/lib/db/client';
import { createProject, updateProject, archiveProject, reorderProjects, getProjectByNameOrId } from '@/lib/core/projects';
import type { MartrelloTool } from './index';

export const projectTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_create_project',
      description: 'Cria um novo projeto. Lists default = ["A fazer","Fazendo","Feito"].',
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          color: { type: 'string', description: 'hex; default #64748b' },
          lists: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    handler: async (input) => createProject(getDb(), {
      name: String(input.name),
      color: input.color as string | undefined,
      lists: input.lists as string[] | undefined,
    }),
  },
  {
    definition: {
      name: 'martrello_update_project',
      description: 'Atualiza nome e/ou cor de um projeto.',
      inputSchema: {
        type: 'object',
        required: ['project'],
        properties: {
          project: { type: 'string', description: 'name ou id' },
          name: { type: 'string' },
          color: { type: 'string' },
        },
      },
    },
    handler: async (input) => {
      const db = getDb();
      const p = await getProjectByNameOrId(db, String(input.project));
      return updateProject(db, p.id, {
        name: input.name as string | undefined,
        color: input.color as string | undefined,
      });
    },
  },
  {
    definition: {
      name: 'martrello_archive_project',
      description: 'Soft-delete: marca projeto como arquivado.',
      inputSchema: {
        type: 'object',
        required: ['project'],
        properties: { project: { type: 'string' } },
      },
    },
    handler: async (input) => {
      const db = getDb();
      const p = await getProjectByNameOrId(db, String(input.project));
      await archiveProject(db, p.id);
      return { ok: true, id: p.id };
    },
  },
  {
    definition: {
      name: 'martrello_reorder_projects',
      description: 'Reordena projetos na sidebar.',
      inputSchema: {
        type: 'object',
        required: ['ordered_ids'],
        properties: { ordered_ids: { type: 'array', items: { type: 'string' } } },
      },
    },
    handler: async (input) => {
      await reorderProjects(getDb(), (input.ordered_ids as string[]) ?? []);
      return { ok: true };
    },
  },
];
