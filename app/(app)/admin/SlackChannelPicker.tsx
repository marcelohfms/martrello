'use client';
import { useState, type TransitionStartFunction } from 'react';
import type { ActionResult } from '@/lib/action-result';
import { sendSlackTestAction, setSlackChannelAction } from './actions';
import { channelOptions, slackReason, type SlackSetup } from './slack-channel';

type Props = {
  projectId: string;
  setup: SlackSetup;
  saved: { id: string; name: string } | null;
  status: string;
  disabled: boolean;
  onResult: (r: ActionResult) => void;
  run: TransitionStartFunction;
};

export function SlackChannelPicker({ projectId, setup, saved, status, disabled, onResult, run }: Props) {
  const [testNote, setTestNote] = useState<{ text: string; error: boolean } | null>(null);
  if (setup.state === 'off') {
    return <p className="text-[13px] text-mt-muted">Slack não configurado</p>;
  }
  if (setup.state === 'error') {
    return (
      <div className="flex flex-col gap-1 text-[13px]">
        <p className="text-mt-danger">Não foi possível listar os canais do Slack: {slackReason(setup.message)}</p>
        {saved && <p className="text-mt-muted">Canal salvo: #{saved.name}</p>}
        <p className="text-[12px] text-mt-muted">{status}</p>
      </div>
    );
  }
  const options = channelOptions(saved, setup.channels);
  return (
    <div className="flex flex-col gap-1.5">
      <select
        aria-label="Canal do Slack"
        className="field !text-[13px]"
        value={saved?.id ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const id = e.target.value;
          const opt = options.find((o) => o.id === id);
          const channel = opt ? { id: opt.id, name: opt.label.replace(/^#/, '').replace(/ \(indisponível\)$/, '') } : null;
          run(async () => onResult(await setSlackChannelAction(projectId, channel)));
        }}
      >
        <option value="">Nenhum</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <p className="text-[12px] text-mt-muted">Não achou o canal? Convide o bot com /invite @prumo</p>
      <p className="text-[12px] text-mt-muted">{status}</p>
      {saved && setup.channels.some((c) => c.id === saved.id) && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost !text-[13px]"
            disabled={disabled}
            onClick={() => {
              setTestNote(null);
              run(async () => {
                const r = await sendSlackTestAction(projectId);
                setTestNote('error' in r ? { text: r.error, error: true } : { text: r.message, error: false });
              });
            }}
          >
            Enviar teste agora
          </button>
          {testNote && (
            <p role="status" className={`text-[12px] ${testNote.error ? 'text-mt-danger' : 'text-mt-muted'}`}>{testNote.text}</p>
          )}
        </div>
      )}
    </div>
  );
}
