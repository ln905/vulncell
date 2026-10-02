// Avatar dùng chung: ảnh lấy từ /api/users/:username/avatar (endpoint nhẹ, cache được);
// user chưa có ảnh -> API trả ảnh anonymous mặc định (200); onError giữ làm lưới an toàn.
const DEFAULT_AVATAR = '/anonymous.png';

export default function Avatar({ username, sizeClass = 'h-6 w-6', className = '' }) {
  return (
    <img
      src={username ? `/api/users/${encodeURIComponent(username)}/avatar` : DEFAULT_AVATAR}
      alt=""
      loading="lazy"
      onError={(e) => {
        e.currentTarget.onerror = null;
        e.currentTarget.src = DEFAULT_AVATAR;
      }}
      className={`${sizeClass} shrink-0 rounded-full bg-zinc-800 object-cover ${className}`}
    />
  );
}
