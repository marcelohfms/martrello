// mcp/tools/read.ts
import { getDb } from '@/lib/db/client';
import { listProjects, getProject } from '@/lib/core/projects';
import { listLabels } from '@/lib/core/labels';
import { searchCards } from '@/lib/core/cards';
import { getMySprint, listSprints, getSprintHistory } from '@/lib/core/sprint';
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
    handler: async (input, { actor }) => listProjects(getDb(), actor, { includeArchived: Boolean(input.include_archived) }),
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
    handler: async (input, { actor }) => getProject(getDb(), actor, String(input.project)),
  },
  {
    definition: {
      name: 'martrello_get_sprint',
      description: 'Retorna a sprint da semana de quem chama (segunda a domingo, horário de São Paulo): as tarefas dela em A fazer e Fazendo, mais as concluídas na semana. Cada card traz stage (todo/doing/done). A sprint abre e fecha sozinha; para mudar um card de etapa use martrello_move_card.',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async (_input, { actor }) => getMySprint(getDb(), actor),
  },
  {
    definition: {
      name: 'martrello_search_cards',
      description: 'Busca cards por substring no título. Filtros opcionais por projeto e responsável. Fora do Backlog precisa de responsável. Sem `assignee`, fica com quem chama.',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          project: { type: 'string' },
          include_archived: { type: 'boolean', default: false },
          assignee: { type: 'string', description: "'me' ou e-mail/nome do responsável" },
        },
      },
    },
    handler: async (input, { actor }) => searchCards(getDb(), actor, {
      query: String(input.query),
      project: input.project as string | undefined,
      includeArchived: Boolean(input.include_archived),
      assignee: input.assignee as string | undefined,
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
      description: 'Lista as sprints semanais de quem chama (atual + fechadas), da mais recente para a mais antiga.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'integer', default: 20 } },
      },
    },
    handler: async (input, { actor }) => listSprints(getDb(), actor, { limit: input.limit as number | undefined }),
  },
  {
    definition: {
      name: 'martrello_get_sprint_history',
      description: 'Retorna o snapshot de uma sprint encerrada de quem chama.',
      inputSchema: {
        type: 'object',
        required: ['sprint_id'],
        properties: { sprint_id: { type: 'string' } },
      },
    },
    handler: async (input, { actor }) => getSprintHistory(getDb(), actor, String(input.sprint_id)),
  },
];
