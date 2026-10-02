import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Markdown from './Markdown';
import Spinner from './Spinner';
import { StaffBadge, stateLabel } from './badges';
import { ALLOWED_TRANSITIONS, SEVERITIES, bountyAllowed, severityAllowed } from '../lib/stateMachine';
import { formatUtc } from '../lib/format';

const fieldClass =
  'w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-gold-500 disabled:cursor-not-allowed disabled:opacity-40';

export default function ActionBox({ report }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [comment, setComment] = useState('');
  const [preview, setPreview] = useState(false);
  const [newState, setNewState] = useState('');
  const [severity, setSeverity] = useState('');
  const [bounty, setBounty] = useState('');
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'ADMIN';
  const transitions = ALLOWED_TRANSITIONS[report.state] || [];
  const stateAfter = newState || report.state;

  const mutation = useMutation({
    mutationFn: (payload) => api.post(`/reports/${report.id}/actions`, payload),
    onSuccess: () => {
      setComment('');
      setNewState('');
      setSeverity('');
      setBounty('');
      setError('');
      setPreview(false);
      queryClient.invalidateQueries({ queryKey: ['report', report.id] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: (err) => setError(err.message),
  });

  if (!user) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
        <Link to="/login" className="font-medium text-gold-300 hover:underline">
          Log in
        </Link>{' '}
        to comment or triage this report.
      </div>
    );
  }

  const onSubmit = (e) => {
    e.preventDefault();
    setError('');

    const payload = {};
    if (comment.trim()) payload.comment = comment.trim();
    if (isAdmin && newState) payload.newState = newState;
    if (isAdmin && severity) payload.severity = severity;
    if (isAdmin && bounty && bountyAllowed(stateAfter)) payload.bountyAmount = Number(bounty);

    if (Object.keys(payload).length === 0) {
      setError('Nothing to submit — write a comment or pick an action.');
      return;
    }
    mutation.mutate(payload);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">
          Action Box
          {isAdmin ? (
            <span className="ml-2">
              <StaffBadge />
            </span>
          ) : null}
        </h2>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="text-xs text-zinc-400 transition hover:text-zinc-200"
        >
          {preview ? '← Write' : 'Preview Markdown →'}
        </button>
      </div>

      {preview ? (
        <div className="min-h-28 rounded-md border border-zinc-700 bg-zinc-950 p-3">
          {comment.trim() ? <Markdown>{comment}</Markdown> : <p className="text-xs text-zinc-600">Nothing to preview.</p>}
        </div>
      ) : (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={5}
          placeholder="Write a comment / feedback (Markdown supported)…"
          className={fieldClass}
        />
      )}

      {isAdmin ? (
        <div className="grid gap-3 border-t border-zinc-800 pt-3 sm:grid-cols-3">
          <label className="block text-xs text-zinc-400">
            Change State
            <select value={newState} onChange={(e) => setNewState(e.target.value)} className={`mt-1 ${fieldClass}`}>
              <option value="">— Keep as is ({stateLabel(report.state)}) —</option>
              {transitions.map((s) => (
                <option key={s} value={s}>
                  {stateLabel(s)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-zinc-400">
            Triage Severity
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              disabled={!severityAllowed(stateAfter)}
              className={`mt-1 ${fieldClass}`}
            >
              <option value="">— No change —</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {!severityAllowed(stateAfter) ? <span className="mt-1 block text-[10px] text-zinc-600">Only when state ≥ Triaged</span> : null}
          </label>

          <label className="block text-xs text-zinc-400">
            Award Bounty ($)
            <input
              type="number"
              min="1"
              value={bounty}
              onChange={(e) => setBounty(e.target.value)}
              disabled={!bountyAllowed(stateAfter)}
              placeholder={bountyAllowed(stateAfter) ? '500' : 'Only when Resolved'}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-zinc-500">Every change is written to the timeline and the ledger — it cannot be undone.</p>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="shrink-0 rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-gold-400 disabled:opacity-50"
        >
          {mutation.isPending ? (
            <span className="inline-flex items-center gap-2">
              <Spinner size="sm" tone="dark" /> Submitting…
            </span>
          ) : isAdmin ? (
            'Submit Action'
          ) : (
            'Post Comment'
          )}
        </button>
      </div>
    </form>
  );
}
