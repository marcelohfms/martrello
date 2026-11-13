import { describe, expect, it } from 'vitest';
import { channelOptions, formatDeliveryStatus, slackReason, testSendMessage } from './slack-channel';

const now = new Date('2026-11-16T13:00:00Z'); // 10h00 em SP
const at = Date.parse('2026-11-16T12:03:00Z'); // 9h03 em SP
const sentAt = Date.parse('2026-11-13T12:02:00Z');
const latest = (status: 'sent' | 'empty' | 'retry' | 'failed', error: string | null = null) => ({
  day: '2026-11-16',
  status,
  error,
  at,
});

describe('channelOptions', () => {
  const channels = [{ id: 'C1', name: 'geral' }];
  it('marca indisponível', () => {
    const r = channelOptions({ id: 'C9', name: 'antigo' }, channels);
    expect(r[0]).toEqual({ id: 'C9', label: '#antigo (indisponível)', unavailable: true });
    expect(r[1]).toEqual({ id: 'C1', label: '#geral', unavailable: false });
  });
  it('sem salvo', () => {
    expect(channelOptions(null, channels)).toEqual([{ id: 'C1', label: '#geral', unavailable: false }]);
  });
  it('salvo presente na lista não duplica', () => {
    expect(channelOptions({ id: 'C1', name: 'geral' }, channels)).toHaveLength(1);
  });
});

describe('slackReason', () => {
  it('traduz códigos conhecidos e repassa os outros', () => {
    expect(slackReason('invalid_auth')).toBe('token do Slack inválido');
    expect(slackReason('weird')).toBe('weird');
  });
});

describe('formatDeliveryStatus', () => {
  it('sem registro', () => {
    expect(formatDeliveryStatus(undefined, now)).toBe('Nenhum envio ainda');
    expect(formatDeliveryStatus({ latest: null, lastSentAt: null }, now)).toBe('Nenhum envio ainda');
  });
  it('sent', () => {
    expect(formatDeliveryStatus({ latest: latest('sent'), lastSentAt: at }, now)).toBe('Enviado em 16/11 9h03');
  });
  it('empty', () => {
    expect(formatDeliveryStatus({ latest: latest('empty'), lastSentAt: null }, now)).toBe('16/11 9h03: nada a avisar');
    expect(formatDeliveryStatus({ latest: latest('empty'), lastSentAt: sentAt }, now)).toBe(
      '16/11 9h03: nada a avisar · último envio 13/11 9h02',
    );
  });
  it('retry', () => {
    expect(formatDeliveryStatus({ latest: latest('retry', 'http_503'), lastSentAt: null }, now)).toBe(
      'Erro em 16/11 9h03: http_503 (tenta de novo até 12h)',
    );
  });
  it('failed com motivos conhecidos e último envio', () => {
    const s = (e: string) => formatDeliveryStatus({ latest: latest('failed', e), lastSentAt: sentAt }, now);
    expect(s('not_in_channel')).toBe('Erro em 16/11 9h03: o bot não está no canal · último envio 13/11 9h02');
    expect(s('channel_not_found')).toContain('canal não encontrado');
    expect(s('invalid_auth')).toContain('token do Slack inválido');
    expect(s('account_inactive')).toContain('token do Slack inválido');
    expect(s('interrupted')).toContain('envio interrompido');
    expect(s('ambiguous')).toContain('sem confirmação do Slack');
    expect(s('weird')).toContain(': weird');
  });
  it('failed sem último envio', () => {
    expect(formatDeliveryStatus({ latest: latest('failed', 'not_in_channel'), lastSentAt: null }, now)).toBe(
      'Erro em 16/11 9h03: o bot não está no canal',
    );
  });
  it('formata dd/mm com zeros e hora sem zero à esquerda', () => {
    const t = Date.parse('2026-11-03T17:30:00Z'); // 14h30 SP
    expect(
      formatDeliveryStatus({ latest: { day: '2026-11-03', status: 'sent', error: null, at: t }, lastSentAt: t }, now),
    ).toBe('Enviado em 03/11 14h30');
  });
  describe('linha encerrada', () => {
    const yesterday = (status: 'retry' | 'sending', error: string | null = null) => ({
      day: '2026-11-15',
      status,
      error,
      at: Date.parse('2026-11-15T12:03:00Z'),
    });
    it('retry de ontem vira erro sem "tenta de novo"', () => {
      expect(formatDeliveryStatus({ latest: yesterday('retry', 'http_503'), lastSentAt: null }, now)).toBe(
        'Erro em 15/11 9h03: http_503',
      );
      expect(formatDeliveryStatus({ latest: yesterday('retry', 'http_503'), lastSentAt: sentAt }, now)).toBe(
        'Erro em 15/11 9h03: http_503 · último envio 13/11 9h02',
      );
    });
    it('retry de hoje às 12h00 SP está encerrado', () => {
      const noon = new Date('2026-11-16T15:00:00Z'); // 12h00 SP
      expect(formatDeliveryStatus({ latest: latest('retry', 'http_503'), lastSentAt: null }, noon)).toBe(
        'Erro em 16/11 9h03: http_503',
      );
    });
    it('retry de hoje às 10h ainda tenta de novo', () => {
      const ten = new Date('2026-11-16T13:00:00Z'); // 10h SP
      expect(formatDeliveryStatus({ latest: latest('retry', 'http_503'), lastSentAt: null }, ten)).toBe(
        'Erro em 16/11 9h03: http_503 (tenta de novo até 12h)',
      );
    });
    it('sending de ontem vira envio interrompido', () => {
      expect(formatDeliveryStatus({ latest: yesterday('sending'), lastSentAt: null }, now)).toBe(
        'Erro em 15/11 9h03: envio interrompido',
      );
      expect(formatDeliveryStatus({ latest: yesterday('sending'), lastSentAt: sentAt }, now)).toBe(
        'Erro em 15/11 9h03: envio interrompido · último envio 13/11 9h02',
      );
    });
  });
});

describe('testSendMessage', () => {
  it('enviado', () => {
    expect(testSendMessage({ result: 'sent', channelName: 'tgs' })).toBe('Mensagem de teste enviada para #tgs.');
  });
  it('nada a avisar', () => {
    expect(testSendMessage({ result: 'empty', channelName: 'tgs' })).toBe(
      'Nada atrasado nem vencendo hoje: nenhuma mensagem enviada para #tgs.',
    );
  });
});
