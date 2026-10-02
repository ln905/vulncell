// Biểu tượng 5 thanh thể hiện mức độ nghiêm trọng (giống HackerOne)
// None = 1 thanh, Low = 2, Medium = 3, High = 4, Critical = 5.
const LEVELS = { NONE: 1, LOW: 2, MEDIUM: 3, HIGH: 4, CRITICAL: 5 };

const ACTIVE_COLORS = {
  NONE: 'bg-indigo-500',
  LOW: 'bg-teal-400',
  MEDIUM: 'bg-yellow-400',
  HIGH: 'bg-orange-500',
  CRITICAL: 'bg-red-500',
};

export default function SeverityBars({ value = 'NONE', size = 'md' }) {
  const level = LEVELS[value] || 1;
  const active = ACTIVE_COLORS[value] || ACTIVE_COLORS.NONE;

  const width = size === 'sm' ? 'w-[3px]' : 'w-1';
  const height = size === 'sm' ? 'h-3' : 'h-3.5';

  return (
    <span className="inline-flex items-center gap-0.5" title={`Severity: ${value}`} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`${width} ${height} rounded-sm ${i < level ? active : 'bg-zinc-700'}`} />
      ))}
    </span>
  );
}
