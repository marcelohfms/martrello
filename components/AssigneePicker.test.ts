import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssigneePicker, type Member } from './AssigneePicker';

const ana: Member = { id: 'u1', name: 'Ana', email: 'ana@x.com', disabled: false };
const bia: Member = { id: 'u2', name: 'Bia', email: 'bia@x.com', disabled: false };
const off: Member = { id: 'u3', name: 'Caio', email: 'caio@x.com', disabled: true };

type Current = { name: string; email: string; disabled: boolean } | null;

function options(current: Current, allowNone: boolean, members: Member[] = [ana, bia, off]) {
  const html = renderToStaticMarkup(
    createElement(AssigneePicker, { members, current, allowNone, onChange: () => {} }),
  );
  return [...html.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].map(([, attrs, label]) => ({
    label,
    value: /value="([^"]*)"/.exec(attrs)?.[1] ?? null,
    selected: /\sselected=""/.test(attrs),
    disabled: /\sdisabled=""/.test(attrs),
  }));
}

describe('AssigneePicker', () => {
  it('oferece "Sem responsável" só no Backlog', () => {
    expect(options(null, true)[0]).toMatchObject({ label: 'Sem responsável', value: '', selected: true, disabled: false });
    expect(options({ ...ana }, false).some((o) => o.label === 'Sem responsável')).toBe(false);
    expect(options({ ...ana }, true).some((o) => o.label === 'Sem responsável' && !o.disabled)).toBe(true);
  });

  it('só membros ativos são selecionáveis', () => {
    const opts = options({ ...ana }, false);
    expect(opts.filter((o) => !o.disabled).map((o) => o.label)).toEqual(['Ana', 'Bia']);
    expect(opts.find((o) => o.selected)).toMatchObject({ label: 'Ana', value: 'ana@x.com' });
  });

  it('responsável que saiu do projeto aparece selecionado e desabilitado', () => {
    const opts = options({ name: 'Duda', email: 'duda@x.com', disabled: false }, false);
    expect(opts.find((o) => o.selected)).toMatchObject({
      label: 'Duda (fora do projeto)', value: 'duda@x.com', disabled: true,
    });
    expect(opts.filter((o) => !o.disabled).map((o) => o.label)).toEqual(['Ana', 'Bia']);
  });

  it('responsável desativado aparece selecionado como (desativado)', () => {
    const opts = options({ name: 'Caio', email: 'caio@x.com', disabled: true }, false, [ana, off]);
    expect(opts.filter((o) => o.label.startsWith('Caio'))).toEqual([
      { label: 'Caio (desativado)', value: 'caio@x.com', selected: true, disabled: true },
    ]);
  });
});
