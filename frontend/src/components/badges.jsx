const SEVERITY_STYLES = {
  NONE: 'bg-zinc-700/40 text-zinc-400',
  LOW: 'bg-sky-500/15 text-sky-300',
  MEDIUM: 'bg-yellow-500/15 text-yellow-300',
  HIGH: 'bg-orange-500/15 text-orange-300',
  CRITICAL: 'bg-rose-500/15 text-rose-300',
};

const STATE_LABELS = {
  NONE: 'None',
  PENDING: 'Pending review',
  TRIAGED: 'Triaged',
  RESOLVED: 'Resolved',
  DUPLICATE: 'Duplicate',
  INFORMATIVE: 'Informative',
  NOT_APPLICABLE: 'Not applicable',
  SPAM: 'Spam',
};

const STATE_STYLES = {
  NONE: 'bg-zinc-700/40 text-zinc-400',
  PENDING: 'bg-zinc-600/30 text-zinc-300',
  TRIAGED: 'bg-violet-500/15 text-violet-300',
  RESOLVED: 'bg-emerald-500/15 text-emerald-300',
  DUPLICATE: 'bg-fuchsia-500/15 text-fuchsia-300',
  INFORMATIVE: 'bg-cyan-500/15 text-cyan-300',
  NOT_APPLICABLE: 'bg-zinc-700/40 text-zinc-400',
  SPAM: 'bg-red-500/20 text-red-300',
};

const badgeBase =
  'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide';

export function SeverityBadge({ value = 'NONE' }) {
  return <span className={`${badgeBase} ${SEVERITY_STYLES[value] || SEVERITY_STYLES.NONE}`}>{value}</span>;
}

export function StateBadge({ value = 'NONE' }) {
  return (
    <span className={`${badgeBase} ${STATE_STYLES[value] || STATE_STYLES.NONE}`}>
      {STATE_LABELS[value] || value}
    </span>
  );
}

// Đánh dấu tài khoản nội bộ (admin) — nền amber nhạt, không viền
export function StaffBadge() {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
      Staff
    </span>
  );
}

// State hiển thị dạng chấm màu + chữ (không khung), dùng cho card ngoài Dashboard
const STATE_DOT_COLORS = {
  NONE: 'bg-zinc-600',
  PENDING: 'bg-zinc-300',
  TRIAGED: 'bg-violet-400',
  RESOLVED: 'bg-emerald-500',
  DUPLICATE: 'bg-fuchsia-400',
  INFORMATIVE: 'bg-zinc-400',
  NOT_APPLICABLE: 'bg-pink-400',
  SPAM: 'bg-red-500',
};

export function StateDot({ value = 'NONE', className = '' }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs ${className}`}>
      <span className={`h-2 w-2 rounded-full ${STATE_DOT_COLORS[value] || STATE_DOT_COLORS.NONE}`} />
      <span className="text-zinc-300">{STATE_LABELS[value] || value}</span>
    </span>
  );
}

export function stateLabel(value) {
  return STATE_LABELS[value] || value;
}
