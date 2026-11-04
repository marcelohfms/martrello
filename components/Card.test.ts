import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Card, type CardData } from './Card';
import { ProjectTag } from './ProjectTag';
import { ProjectPrivacyProvider } from './ProjectPrivacyContext';

vi.mock('@/app/actions', () => ({
  addToSprintAction: vi.fn(),
  removeFromSprintAction: vi.fn(),
}));

const card: CardData = {
  id: 'c1',
  title: 'Política de reembolso',
  dueDate: null,
  labels: [],
  projectName: 'Axivero',
  projectAcronym: 'AXV',
  projectColor: '#6b8e4e',
  isBlocked: false,
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

describe('Card sprint button', () => {
  it('offers sending to the sprint when the card is out of it', () => {
    expect(render('project', { ...card, inSprint: false })).toContain('aria-label="Enviar para a Sprint"');
  });

  it('offers moving to the backlog when the card is in the sprint', () => {
    const html = render('project', { ...card, inSprint: true });
    expect(html).toContain('aria-label="Mover para o Backlog (tirar da Sprint)"');
    expect(html).not.toContain('Enviar para a Sprint');
  });

  it('is hidden when there is no active sprint', () => {
    const html = render('project', { ...card, inSprint: undefined });
    expect(html).not.toContain('Enviar para a Sprint');
    expect(html).not.toContain('Mover para o Backlog');
  });

  it('is hidden on the copy that follows the pointer during a drag', () => {
    expect(render('sprint', { ...card, inSprint: true }, true)).not.toContain('Mover para o Backlog');
  });

  it('never nests a button inside the card button', () => {
    const html = render('project', { ...card, inSprint: false });
    const first = html.indexOf('<button');
    const firstClose = html.indexOf('</button>');
    expect(html.indexOf('<button', first + 1)).toBeGreaterThan(firstClose);
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
