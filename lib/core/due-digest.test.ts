import { describe, expect, it } from 'vitest';
import type { DueCard } from './due-cards';
import { buildDigest, isEmptyDigest, renderDigest, type Digest } from './due-digest';

const card = (title: string, dueDate: string, position = 0, email: string | null = null, name: string | null = null): DueCard => ({
  title, dueDate, position, assigneeEmail: email, assigneeName: name,
});

const ids = new Map([
  ['ana@x.com', 'UANA'],
  ['bruno@x.com', 'UBRUNO'],
  ['marcelo@x.com', 'UMARCELO'],
]);
const baseOpts = { projectName: 'Motim', today: '2026-11-16', boardUrl: 'https://app.test/project/p1', slackIdByEmail: ids };

describe('buildDigest', () => {
  const cards = [
    card('a', '2026-11-12'),
    card('b', '2026-11-16'),
    card('c', '2026-11-18'),
    card('d', '2026-11-22'),
    card('e', '2026-11-23'),
  ];

  it('agrupa por prazo e só inclui a semana quando pedido', () => {
    const d = buildDigest(cards, '2026-11-16', true);
    expect(d.overdue.map((c) => c.title)).toEqual(['a']);
    expect(d.today.map((c) => c.title)).toEqual(['b']);
    expect(d.week.map((c) => c.title)).toEqual(['c', 'd']);
    expect(buildDigest(cards, '2026-11-16', false).week).toEqual([]);
  });

  it('ordena por data e depois posição', () => {
    const d = buildDigest(
      [card('x', '2026-11-13', 2), card('y', '2026-11-12', 5), card('z', '2026-11-13', 1)],
      '2026-11-16',
      false,
    );
    expect(d.overdue.map((c) => c.title)).toEqual(['y', 'z', 'x']);
  });
});

describe('isEmptyDigest', () => {
  it('só é vazio quando todos os grupos são vazios', () => {
    expect(isEmptyDigest({ overdue: [], today: [], week: [] })).toBe(true);
    expect(isEmptyDigest({ overdue: [], today: [card('a', '2026-11-16')], week: [] })).toBe(false);
    expect(isEmptyDigest({ overdue: [], today: [], week: [card('a', '2026-11-18')] })).toBe(false);
  });
});

describe('renderDigest', () => {
  it('renderiza o exemplo da spec', () => {
    const d: Digest = {
      overdue: [
        card('Subir landing nova', '2026-11-12'),
        card('Revisar contrato de licença', '2026-11-13', 0, 'ana@x.com', 'Ana'),
      ],
      today: [card('Enviar relatório mensal', '2026-11-16', 0, 'marcelo@x.com', 'Marcelo')],
      week: [
        card('Ajustar pipeline de deploy', '2026-11-18', 0, 'bruno@x.com', 'Bruno'),
        card('Revisão do roteiro da aula 4', '2026-11-19', 0, 'ana@x.com', 'Ana'),
        card('Fechar orçamento Q1', '2026-11-22', 0, 'marcelo@x.com', 'Marcelo'),
      ],
    };
    expect(renderDigest(d, baseOpts)).toBe(
      [
        '*Prazos de hoje · Motim* — segunda, 16/11',
        '',
        '🔴 *Atrasadas (2)*',
        '• Subir landing nova — sem responsável · venceu qui 12/11',
        '• Revisar contrato de licença — <@UANA> · venceu sex 13/11',
        '',
        '🟡 *Vencem hoje (1)*',
        '• Enviar relatório mensal — <@UMARCELO>',
        '',
        '🗓️ *Resto da semana (3)*',
        '• qua 18/11 — Ajustar pipeline de deploy — <@UBRUNO>',
        '• qui 19/11 — Revisão do roteiro da aula 4 — <@UANA>',
        '• dom 22/11 — Fechar orçamento Q1 — <@UMARCELO>',
        '',
        '<https://app.test/project/p1|Abrir quadro>',
      ].join('\n'),
    );
  });

  it('sem bloco de semana de terça a sexta', () => {
    const out = renderDigest({ overdue: [], today: [card('a', '2026-11-17')], week: [] }, { ...baseOpts, today: '2026-11-17' });
    expect(out).not.toContain('🗓️');
    expect(out).toContain('terça, 17/11');
  });

  it('escapa título e nome', () => {
    const out = renderDigest(
      { overdue: [], today: [card('a <!channel> & b', '2026-11-16', 0, 'z@x.com', 'Z <b>')], week: [] },
      { ...baseOpts, projectName: 'A&B' },
    );
    expect(out).toContain('a &lt;!channel&gt; &amp; b');
    expect(out).not.toContain('<!channel>');
    expect(out).toContain('Z &lt;b&gt;');
    expect(out).toContain('A&amp;B');
  });

  it('e-mail fora do mapa vira nome sem @', () => {
    const out = renderDigest({ overdue: [], today: [card('a', '2026-11-16', 0, 'x@y.com', 'Xuxa')], week: [] }, baseOpts);
    expect(out).toContain('• a — Xuxa');
    expect(out).not.toContain('<@');
  });
});
