import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { SeverityBadge, StaffBadge, StateBadge, stateLabel } from '../components/badges';
import Avatar from '../components/Avatar';
import Spinner from '../components/Spinner';
import TimelineBlock, { eventDotClass } from '../components/TimelineBlock';
import ActionBox from '../components/ActionBox';
import { formatUtc, shortId } from '../lib/format';
import { isDisclosed } from '../lib/stateMachine';

function InfoRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-xs text-zinc-500">{label}</dt>
      <dd className="text-right text-xs text-zinc-200">{children}</dd>
    </div>
  );
}

function InfoPanel({ report }) {
  return (
    <dl className="divide-y divide-zinc-800 rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2">
      <InfoRow label="Reported on">{formatUtc(report.createdAt)}</InfoRow>
      <InfoRow label="Reported by">
        <span className="inline-flex items-center gap-1.5">
          <Avatar username={report.reporter?.username} sizeClass="h-5 w-5" />
          <Link to={`/u/${report.reporter?.username}`} className="text-gold-300 hover:underline">
            {report.reporter?.username}
          </Link>
          {report.reporter?.role === 'ADMIN' ? <StaffBadge /> : null}
        </span>
      </InfoRow>
      <InfoRow label="Report ID">
        <span className="font-mono" title={report.id}>
          {shortId(report.id)}
        </span>
      </InfoRow>
      <InfoRow label="Triage severity">
        <SeverityBadge value={report.severity} />
      </InfoRow>
      <InfoRow label="State">
        <StateBadge value={report.state} />
      </InfoRow>
      <InfoRow label="Bounty">
        {report.bounty ? (
          <span className="font-semibold text-emerald-400">${report.bounty.toLocaleString('en-US')}</span>
        ) : (
          <span className="text-zinc-500">None</span>
        )}
      </InfoRow>
      <InfoRow label="Disclosed">{report.disclosedAt ? formatUtc(report.disclosedAt) : <span className="text-zinc-500">None</span>}</InfoRow>
      <InfoRow label="Weakness">{report.weakness}</InfoRow>
      <InfoRow label="CVE ID">{report.cveId || <span className="text-zinc-500">None</span>}</InfoRow>
      <InfoRow label="Target">{report.target}</InfoRow>
    </dl>
  );
}

export default function CasePage() {
  const { id } = useParams();
  const [showInfo, setShowInfo] = useState(true);

  const reportQuery = useQuery({
    queryKey: ['report', id],
    queryFn: () => api.get(`/reports/${id}`),
  });

  const eventsQuery = useQuery({
    queryKey: ['report', id, 'events'],
    queryFn: () => api.get(`/reports/${id}/events`),
  });

  if (reportQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
        <Spinner /> Loading report…
      </div>
    );
  }

  if (reportQuery.isError) {
    return (
      <div className="py-16 text-center text-sm">
        <p className="text-red-400">
          {reportQuery.error.status === 404 ? 'Report not found.' : `Error: ${reportQuery.error.message}`}
        </p>
        <Link to="/" className="mt-3 inline-block text-gold-300 hover:underline">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const report = reportQuery.data;
  const events = eventsQuery.data || [];
  const closed = isDisclosed(report.state);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Cột chính: Tab 2 — nội dung + timeline + action box */}
      <div className="min-w-0 flex-1 space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="font-medium text-zinc-300">{report.target}</span>
            <span
              className="inline-flex items-center rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400"
              title={report.id}
            >
              #{shortId(report.id)}
            </span>
            <StateBadge value={report.state} />
          </div>
          <h1 className="mt-2 text-2xl font-bold text-zinc-50">
            {report.weakness}
            {report.cveId ? <span className="text-zinc-500"> — {report.cveId}</span> : null}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">{report.shortDescription}</p>
        </div>

        {/* Timeline dạng rail: đường nối dọc + chấm màu theo loại event */}
        {eventsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Spinner /> Loading timeline…
          </div>
        ) : (
          <ol>
            {events.map((ev) => (
              <li
                key={ev.id}
                className="relative pb-4 pl-8 last:pb-0 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:bg-zinc-800 before:content-[''] first:before:top-4 last:before:h-5"
              >
                <span
                  className={`absolute left-0 top-4 z-10 h-3 w-3 -translate-x-1/2 rounded-full ring-4 ring-zinc-950 ${eventDotClass(ev.type)}`}
                />
                <TimelineBlock event={ev} report={report} />
              </li>
            ))}
          </ol>
        )}

        {closed ? (
          <p className="rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-500">
            This report is closed and no longer accepts new activities.
          </p>
        ) : (
          <ActionBox report={report} />
        )}
      </div>

      {/* Tab 1 — sidebar thông tin, mở/co được */}
      <aside className="w-full shrink-0 lg:w-72">
        <button
          onClick={() => setShowInfo((s) => !s)}
          className="mb-2 flex w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-600"
        >
          <span>Report details</span>
          <span>{showInfo ? '▲ Collapse' : '▼ Expand'}</span>
        </button>
        {showInfo ? <InfoPanel report={report} /> : null}
        <p className="mt-3 px-1 text-[11px] leading-relaxed text-zinc-600">
          Severity is set from Triaged onward. Closed reports no longer accept new activity.
        </p>
      </aside>
    </div>
  );
}
