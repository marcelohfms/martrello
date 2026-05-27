// mcp/tools/labels.ts
import { getDb } from '@/lib/db/client';
import { createLabel, addLabelToCard, removeLabelFromCard, deleteLabel } from '@/lib/core/labels';
import type { MartrelloTool } from './index';

export const labelTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_create_label',
      description: 'Cria uma label global. Cor em hex (ex: #ef4444).',
      inputSchema: {
        type: 'object',
        required: ['name', 'color'],
        properties: { name: { type: 'string' }, color: { type: 'string' } },
      },
    },
    handler: async (input) => createLabel(getDb(), String(input.name), String(input.color)),
  },
  {
    definition: {
      name: 'martrello_add_label',
      description: 'Anexa label existente a um card. Se a label não existir, retorna LABEL_NOT_FOUND.',
      inputSchema: {
        type: 'object',
        required: ['card_id', 'label'],
        properties: { card_id: { type: 'string' }, label: { type: 'string' } },
      },
    },
    handler: async (input) => {
      await addLabelToCard(getDb(), String(input.card_id), String(input.label));
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_remove_label',
      description: 'Remove label de um card. Idempotente.',
      inputSchema: {
        type: 'object',
        required: ['card_id', 'label'],
        properties: { card_id: { type: 'string' }, label: { type: 'string' } },
      },
    },
    handler: async (input) => {
      await removeLabelFromCard(getDb(), String(input.card_id), String(input.label));
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_delete_label',
      description: 'Deleta label globalmente (remove de todos os cards).',
      inputSchema: {
        type: 'object',
        required: ['label'],
        properties: { label: { type: 'string' } },
      },
    },
    handler: async (input) => {
      await deleteLabel(getDb(), String(input.label));
      return { ok: true };
    },
  },
];
