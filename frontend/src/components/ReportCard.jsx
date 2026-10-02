import { Link } from 'react-router-dom';
import { SeverityBadge, StateDot } from './badges';
import Avatar from './Avatar';

function formatUtc(dateString) {
  if (!dateString) return '';
  return `${new Date(dateString).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

// Kiểu HackerOne: bài mới hiện thời gian tương đối ("3 days ago"), cũ hơn hiện mốc UTC
function formatWhen(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return formatUtc(dateString);
}

export default function ReportCard({ report }) {
  return (
    <Link
      to={`/cases/${report.id}`}
      className="block rounded-md border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-zinc-600 hover:bg-zinc-900"
    >
      {/* Target bên trái · cụm [severity · tiền · state] nằm liền một khối sát phải */}
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-zinc-400">{report.target}</span>
        <span className="flex shrink-0 items-center gap-3">
          {report.severity !== 'NONE' ? <SeverityBadge value={report.severity} /> : null}
          {report.bounty ? (
            <span className="text-xs font-semibold text-zinc-200">${report.bounty.toLocaleString('en-US')}</span>
          ) : null}
          <StateDot value={report.state} />
        </span>
      </div>

      <h3 className="mt-2 font-semibold text-sky-400">
        {report.weakness}
        {report.cveId ? <span className="text-sky-600"> — {report.cveId}</span> : null}
      </h3>

      <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{report.shortDescription}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-zinc-500">
        {report.isPrivate ? (
          <span className="rounded-full bg-zinc-700/50 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
            Private
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <Avatar username={report.reporter?.username} sizeClass="h-5 w-5" />
          <span>
            reported by <span className="text-zinc-400">{report.reporter?.username || 'unknown'}</span>
          </span>
        </span>
        <span>·</span>
        <span title={formatUtc(report.createdAt)}>{formatWhen(report.createdAt)}</span>
      </div>
    </Link>
  );
}
