import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Card, type CardData } from './Card';
import { ProjectTag } from './ProjectTag';
import { ProjectPrivacyProvider } from './ProjectPrivacyContext';

const card: CardData = {
  id: 'c1',
  title: 'Política de reembolso',
  dueDate: null,
  labels: [],
  projectName: 'Axivero',
  projectAcronym: 'AXV',
  projectColor: '#6b8e4e',
  isBlocked: false,
  assignee: null,
  completedAt: null,
};

function render(variant: 'project' | 'sprint', data: CardData = card, lifted = false) {
  return renderToStaticMarkup(
    createElement(ProjectPrivacyProvider, null, createElement(Card, { card: data, variant, lifted })),
  );
}

describe('Card project tag', () => {
  it('shows the acronym on sprint cards', () => {
    expect(render('sprint')).toContain('AXV');
  });

  it('shows the tag even when the card has no other metadata', () => {
    const html = render('sprint', { ...card, dueDate: null, labels: [], isBlocked: false });
    expect(html).toContain('>AXV</span>');
  });

  it('puts the tag before the title in the same row', () => {
    const html = render('sprint');
    const row = html.slice(html.indexOf('flex items-start gap-2'));
    expect(row.indexOf('AXV')).toBeGreaterThan(-1);
    expect(row.indexOf('AXV')).toBeLessThan(row.indexOf(card.title));
  });

  it('does not leak the real project name while hidden', () => {
    expect(render('sprint')).not.toContain('Axivero');
  });

  it('has no tag on project board cards', () => {
    expect(render('project')).not.toContain('AXV');
  });
});

describe('Card assignee and completion', () => {
  it('mostra as iniciais do responsável', () => {
    const html = render('project', { ...card, assignee: { name: 'Marcelo Ferro' } });
    expect(html).toContain('>MF</span>');
    expect(html).toContain('title="Marcelo Ferro"');
    expect(html).toContain('Responsável: Marcelo Ferro');
  });

  it('não mostra nada para tarefa sem responsável', () => {
    const html = render('project');
    expect(html).not.toContain('Responsável');
    expect(html).not.toContain('rounded-full bg-ax');
  });

  it('mostra Concluída em 12/11 para card em Feito', () => {
    const html = render('project', { ...card, completedAt: new Date(2026, 10, 12, 15, 0).getTime() });
    expect(html).toContain('Concluída em 12/11');
  });

  it('não mostra conclusão para card fora de Feito', () => {
    expect(render('project')).not.toContain('Concluída');
  });
});

describe('Card actions', () => {
  it('has a single button and no sprint toggle', () => {
    for (const variant of ['project', 'sprint'] as const) {
      const html = render(variant);
      expect(html.match(/<button/g)).toHaveLength(1);
      expect(html).not.toContain('Sprint');
    }
  });
});

describe('ProjectTag', () => {
  it('keeps the acronym as visible text when the name is revealed', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectTag, { acronym: 'AXV', color: '#6b8e4e', name: 'Axivero' }),
    );
    expect(html).toContain('>AXV</span>');
    expect(html).toContain('title="Axivero"');
  });
});
