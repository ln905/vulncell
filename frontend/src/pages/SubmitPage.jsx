import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Markdown from '../components/Markdown';
import Spinner from '../components/Spinner';

const inputClass =
  'w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-gold-500';

const INITIAL = { target: '', weakness: '', cveId: '', shortDescription: '', details: '' };

export default function SubmitPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState(INITIAL);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');

  // Signal âm -> tạm khóa nộp report (backend cũng chặn bằng 429)
  const submitBlocked = Boolean(user && (user.signal ?? 0) < 0);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const mutation = useMutation({
    mutationFn: (payload) => api.post('/reports', payload),
    onSuccess: (report) => navigate(`/cases/${report.id}`),
    onError: (err) => {
      if (err.status === 429) setError(err.message);
      else setError(err.message || 'Could not submit the report.');
    },
  });

  const canSubmit =
    form.target.trim().length >= 3 &&
    form.weakness.trim().length >= 2 &&
    form.shortDescription.trim().length >= 10 &&
    form.details.trim().length >= 20 &&
    !mutation.isPending;

  // Admin không nộp report — vào thẳng trang chủ
  if (user?.role === 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  const onSubmit = (e) => {
    e.preventDefault();
    setError('');
    mutation.mutate({
      target: form.target.trim(),
      weakness: form.weakness.trim(),
      cveId: form.cveId.trim() || null,
      shortDescription: form.shortDescription.trim(),
      details: form.details.trim(),
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Submit Report</h1>
        <p className="mt-1 text-sm text-zinc-400">
          The clearer your reproduction steps (PoC), the faster it gets triaged. New reports start in <b>Pending review</b>.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            Target *
            <input className={`mt-1 ${inputClass}`} value={form.target} onChange={set('target')} placeholder="shop.vulncell.dev/checkout" required />
          </label>
          <label className="block text-xs text-zinc-400">
            Weakness *
            <input className={`mt-1 ${inputClass}`} value={form.weakness} onChange={set('weakness')} placeholder="Reflected XSS" required />
          </label>
        </div>

        <label className="block text-xs text-zinc-400">
          CVE ID (optional)
          <input className={`mt-1 ${inputClass}`} value={form.cveId} onChange={set('cveId')} placeholder="CVE-2026-12345" />
        </label>

        <label className="block text-xs text-zinc-400">
          Short Description * <span className="text-zinc-600">({form.shortDescription.length}/500 — shown on the Dashboard)</span>
          <textarea
            className={`mt-1 ${inputClass}`}
            rows={2}
            maxLength={500}
            value={form.shortDescription}
            onChange={set('shortDescription')}
            placeholder="One-sentence summary of the issue…"
            required
          />
        </label>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Proof of Concept / Details * (Markdown — reproduction steps, impact…)</span>
            <button type="button" onClick={() => setPreview((p) => !p)} className="text-xs text-zinc-400 transition hover:text-zinc-200">
              {preview ? '← Write' : 'Preview Markdown →'}
            </button>
          </div>
          {preview ? (
            <div className="mt-1 min-h-40 rounded-md border border-zinc-700 bg-zinc-950 p-3">
              {form.details.trim() ? <Markdown>{form.details}</Markdown> : <p className="text-xs text-zinc-600">Nothing to preview.</p>}
            </div>
          ) : (
            <textarea
              className={`mt-1 ${inputClass} font-mono text-xs`}
              rows={12}
              value={form.details}
              onChange={set('details')}
              placeholder={'## Steps to reproduce\n1. Open …\n2. Enter payload …\n\n## Impact\n…'}
              required
            />
          )}
        </div>

        {submitBlocked ? (
          <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
            Your Signal is negative ({user.signal}) — submissions are temporarily blocked. Improve your Signal to submit
            again.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Daily submission limit depends on <b>Signal</b>: negative → 0 reports/day, 0–4 → 1/day, ≥ 5 → unlimited.
          </p>
          <button
            type="submit"
            disabled={!canSubmit || submitBlocked}
            className="shrink-0 rounded-md bg-gold-500 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mutation.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="sm" tone="dark" /> Submitting…
              </span>
            ) : (
              'Submit Report'
            )}
          </button>
        </div>
      </form>

      <p className="text-center text-xs text-zinc-600">
        <Link to="/" className="hover:text-zinc-400">
          ← Back to Dashboard
        </Link>
      </p>
    </div>
  );
}
