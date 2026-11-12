import { describe, expect, it } from 'vitest';
import { historyLine, initials, formatEventTime } from './card-format';

describe('initials', () => {
  it('uses the first letter of the first and last word', () => {
    expect(initials('Marcelo Henrique Ferro')).toBe('MF');
    expect(initials('ana souza')).toBe('AS');
  });
  it('uses the first two letters of a single word', () => {
    expect(initials('Marcelo')).toBe('MA');
    expect(initials('  Bia  ')).toBe('BI');
  });
  it('is empty for a blank name', () => {
    expect(initials('   ')).toBe('');
  });
});

const at = new Date(2026, 10, 12, 9, 5).getTime();
const when = '12/11 09:05';

describe('formatEventTime', () => {
  it('formats dd/MM HH:mm in local time', () => {
    expect(formatEventTime(at)).toBe(when);
  });
});

function line(type: string, from: string | null, to: string | null, actorName: string | null = 'Ana') {
  return historyLine({ type: type as never, from, to, at, actorName });
}

describe('historyLine', () => {
  it('describes creation and stage moves', () => {
    expect(line('created', null, 'Backlog')).toBe(`Ana · criou em Backlog · ${when}`);
    expect(line('stage', 'A fazer', 'Fazendo')).toBe(`Ana · moveu de A fazer para Fazendo · ${when}`);
  });
  it('says Sistema when there is no actor', () => {
    expect(line('migrated', null, null, null)).toBe(
      `Sistema · migração para o modelo com responsáveis · ${when}`,
    );
  });
  it('describes assignee changes, with ninguém for empty', () => {
    expect(line('assignee', null, 'a@x.com')).toBe(`Ana · responsável: ninguém → a@x.com · ${when}`);
    expect(line('assignee', 'a@x.com', null)).toBe(`Ana · responsável: a@x.com → ninguém · ${when}`);
  });
  it('maps assignee emails to names when known', () => {
    const l = historyLine(
      { type: 'assignee', from: null, to: 'a@x.com', at, actorName: 'Ana' },
      { 'a@x.com': 'Ana Souza' },
    );
    expect(l).toBe(`Ana · responsável: ninguém → Ana Souza · ${when}`);
  });
  it('describes deadline, title and description', () => {
    expect(line('due_date', null, '2026-11-20')).toBe(`Ana · prazo: — → 2026-11-20 · ${when}`);
    expect(line('title', 'a', 'Novo')).toBe(`Ana · renomeou para Novo · ${when}`);
    expect(line('description', null, 'x')).toBe(`Ana · editou a descrição · ${when}`);
  });
  it('describes labels, dependencies, project and archive without raw ids', () => {
    expect(line('label_added', null, 'Urgente')).toBe(`Ana · adicionou a label Urgente · ${when}`);
    expect(line('label_removed', 'Urgente', null)).toBe(`Ana · removeu a label Urgente · ${when}`);
    expect(line('dependency_added', null, '01HXYZ')).toBe(`Ana · adicionou dependência · ${when}`);
    expect(line('dependency_removed', '01HXYZ', null)).toBe(`Ana · removeu dependência · ${when}`);
    expect(line('project', '01A', '01B')).toBe(`Ana · moveu para outro projeto · ${when}`);
    expect(line('archived', null, null)).toBe(`Ana · arquivou · ${when}`);
    expect(line('unarchived', null, null)).toBe(`Ana · desarquivou · ${when}`);
  });
});
