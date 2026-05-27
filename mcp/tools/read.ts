// mcp/tools/read.ts
import { getDb } from '@/lib/db/client';
import { listProjects, getProjectByNameOrId } from '@/lib/core/projects';
import { listLabels } from '@/lib/core/labels';
import { searchCards } from '@/lib/core/cards';
import { getActiveSprint, listSprints, getSprintHistory } from '@/lib/core/sprint';
import type { MartrelloTool } from './index';

export const readTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_list_projects',
      description: 'Lista todos os projetos (com counts de listas e cards). Por padrão exclui arquivados.',
      inputSchema: {
        type: 'object',
        properties: { include_archived: { type: 'boolean', default: false } },
      },
    },
    handler: async (input) => listProjects(getDb(), { includeArchived: Boolean(input.include_archived) }),
  },
  {
    definition: {
      name: 'martrello_get_project',
      description: 'Retorna o estado completo de um projeto: listas e cards (com labels).',
      inputSchema: {
        type: 'object',
        required: ['project'],
        properties: { project: { type: 'string', description: 'name ou id' } },
      },
    },
    handler: async (input) => getProjectByNameOrId(getDb(), String(input.project)),
  },
  {
    definition: {
      name: 'martrello_get_sprint',
      description: 'Retorna a sprint ativa com todos os cards agrupados por coluna (backlog/doing/done).',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async () => getActiveSprint(getDb()),
  },
  {
    definition: {
      name: 'martrello_search_cards',
      description: 'Busca cards por substring no título. Filtros opcionais por projeto e label.',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          project: { type: 'string' },
          label: { type: 'string' },
          include_archived: { type: 'boolean', default: false },
        },
      },
    },
    handler: async (input) => searchCards(getDb(), {
      query: String(input.query),
      project: input.project as string | undefined,
      label: input.label as string | undefined,
      includeArchived: Boolean(input.include_archived),
    }),
  },
  {
    definition: {
      name: 'martrello_list_labels',
      description: 'Lista todas as labels com contagem de cards usando cada uma.',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async () => listLabels(getDb()),
  },
  {
    definition: {
      name: 'martrello_list_sprints',
      description: 'Lista sprints (ativa + fechadas) em ordem reversa por started_at.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'integer', default: 20 } },
      },
    },
    handler: async (input) => listSprints(getDb(), { limit: input.limit as number | undefined }),
  },
  {
    definition: {
      name: 'martrello_get_sprint_history',
      description: 'Retorna o snapshot de uma sprint encerrada.',
      inputSchema: {
        type: 'object',
        required: ['sprint_id'],
        properties: { sprint_id: { type: 'string' } },
      },
    },
    handler: async (input) => getSprintHistory(getDb(), String(input.sprint_id)),
  },
];
