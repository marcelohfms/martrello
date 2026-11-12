/** Confirmation shown before removing someone from a project. `project` follows the privacy toggle. */
export function removeMemberConfirmMessage(member: string, project: string): string {
  return `Remover ${member} de ${project}? As tarefas da pessoa em A fazer e Fazendo deste projeto voltam para o Backlog sem responsável.`;
}
