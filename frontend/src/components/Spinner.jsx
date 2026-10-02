// Spinner xoay nhẹ — màu vàng gold theo theme, dùng cho mọi trạng thái đang tải.
// tone="dark" để đặt trong nút nền vàng (spinner màu tối cho tương phản).
const SIZES = {
  sm: 'h-3.5 w-3.5 border-2',
  md: 'h-5 w-5 border-2',
  lg: 'h-8 w-8 border-[3px]',
};

const TONES = {
  gold: 'border-gold-500/25 border-t-gold-500',
  dark: 'border-zinc-950/25 border-t-zinc-950',
  zinc: 'border-zinc-600 border-t-zinc-300',
};

export default function Spinner({ size = 'md', tone = 'gold', className = '' }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block shrink-0 animate-spin rounded-full ${SIZES[size]} ${TONES[tone]} ${className}`}
    />
  );
}
