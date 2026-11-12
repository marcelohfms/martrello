// mcp/tools/projects.ts
import { getDb } from '@/lib/db/client';
import { createProject, updateProject, archiveProject, reorderProjects, getProjectByNameOrId } from '@/lib/core/projects';
import { assertAdmin } from '@/lib/access/guard';
import type { MartrelloTool } from './index';

export const projectTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_create_project',
      description: 'Cria um novo projeto. Sempre cria as etapas fixas Backlog, A fazer, Fazendo e Feito. Só admin.',
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          acronym: { type: 'string', description: '3 letras; auto-sugerido se omitido' },
          color: { type: 'string', description: 'hex; default: cycles through a green palette' },
        },
      },
    },
    handler: async (input, { actor }) => createProject(getDb(), actor, {
      name: String(input.name),
      acronym: input.acronym as string | undefined,
      color: input.color as string | undefined,
    }),
  },
  {
    definition: {
      name: 'martrello_update_project',
      description: 'Atualiza nome, cor e/ou acrônimo de um projeto. Só admin.',
      inputSchema: {
        type: 'object',
        required: ['project'],
        properties: {
          project: { type: 'string', description: 'name ou id' },
          name: { type: 'string' },
          color: { type: 'string' },
          acronym: { type: 'string' },
        },
      },
    },
    handler: async (input, { actor }) => {
      const db = getDb();
      assertAdmin(actor);
      const p = await getProjectByNameOrId(db, String(input.project));
      return updateProject(db, actor, p.id, {
        name: input.name as string | undefined,
        color: input.color as string | undefined,
        acronym: input.acronym as string | undefined,
      });
    },
  },
  {
    definition: {
      name: 'martrello_archive_project',
      description: 'Soft-delete: marca projeto como arquivado. Só admin.',
      inputSchema: {
        type: 'object',
        required: ['project'],
        properties: { project: { type: 'string' } },
      },
    },
    handler: async (input, { actor }) => {
      const db = getDb();
      assertAdmin(actor);
      const p = await getProjectByNameOrId(db, String(input.project));
      await archiveProject(db, actor, p.id);
      return { ok: true, id: p.id };
    },
  },
  {
    definition: {
      name: 'martrello_reorder_projects',
      description: 'Reordena projetos na sidebar. Só admin.',
      inputSchema: {
        type: 'object',
        required: ['ordered_ids'],
        properties: { ordered_ids: { type: 'array', items: { type: 'string' } } },
      },
    },
    handler: async (input, { actor }) => {
      await reorderProjects(getDb(), actor, (input.ordered_ids as string[]) ?? []);
      return { ok: true };
    },
  },
];
