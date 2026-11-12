import { describe, expect, it } from 'vitest';
import { removeMemberConfirmMessage } from './remove-member-message';

describe('removeMemberConfirmMessage', () => {
  it('nomeia a pessoa, o projeto e o efeito nas tarefas', () => {
    expect(removeMemberConfirmMessage('Bia', 'AXV')).toBe(
      'Remover Bia de AXV? As tarefas da pessoa em A fazer e Fazendo deste projeto voltam para o Backlog sem responsável.',
    );
  });
});
