import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, FilePlus2, LineChart, Menu, Trophy, UserRound, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { StaffBadge } from './badges';
import Spinner from './Spinner';

// Rail dọc chỉ có icon, mục đang mở được tô thành vòng tròn
const railItem = ({ isActive }) =>
  `grid h-10 w-10 place-items-center rounded-full transition ${
    isActive ? 'bg-gold-500 text-zinc-950' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200'
  }`;

function Logo({ onClick }) {
  return (
    <Link to="/" onClick={onClick} className="flex items-center gap-2 text-lg font-bold tracking-tight">
      <img src="/logo.png" alt="VulnCell" className="h-7 w-7 object-contain" />
      VulnCell
    </Link>
  );
}

function MobileLink({ to, end, onClick, children, muted = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center justify-between border-b border-zinc-800 px-3 py-4 text-sm font-medium uppercase tracking-wider transition ${
          isActive ? 'text-gold-300' : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
        }${muted ? ' opacity-40' : ''}`
      }
    >
      {children}
      <ChevronRight className="h-4 w-4 text-zinc-600" />
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Signal âm -> tạm khóa nộp report: làm mờ nút Submit (navbar/rail/mobile menu)
  const submitBlocked = Boolean(user && user.role !== 'ADMIN' && (user.signal ?? 0) < 0);

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = async () => {
    setMenuOpen(false);
    setLoggingOut(true);
    try {
      await logout();
      navigate('/');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top bar: logo sát trái, tài khoản/hành động sát phải ở mọi độ phân giải */}
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="flex h-14 w-full items-center gap-4 px-4">
          <Logo />

          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (
              <>
                {/* Desktop */}
                <Link
                  to={`/u/${user.username}`}
                  className="hidden items-center gap-2 text-zinc-400 hover:text-zinc-100 md:flex"
                >
                  <img
                    src={user.avatar || '/anonymous.png'}
                    alt=""
                    className="h-6 w-6 rounded-full bg-zinc-800 object-cover"
                  />
                  {user.username}
                  {user.role === 'ADMIN' ? <StaffBadge /> : null}
                </Link>
                {user.role !== 'ADMIN' ? (
                  <Link
                    to="/submit"
                    title={submitBlocked ? 'Your Signal is negative — submissions are temporarily blocked' : 'Submit Report'}
                    className={`hidden rounded-md px-3 py-1.5 font-semibold transition md:inline-block ${
                      submitBlocked
                        ? 'cursor-not-allowed bg-gold-500/25 text-zinc-500'
                        : 'bg-gold-500 text-zinc-950 hover:bg-gold-400'
                    }`}
                  >
                    Submit Report
                  </Link>
                ) : null}
                <button onClick={handleLogout} className="hidden text-zinc-400 transition hover:text-zinc-100 md:inline">
                  {loggingOut ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner size="sm" /> Logging out…
                    </span>
                  ) : (
                    'Logout'
                  )}
                </button>

                {/* Mobile: nút mở menu tổng hợp */}
                <button
                  onClick={() => setMenuOpen(true)}
                  className="grid h-9 w-9 place-items-center rounded-md border border-zinc-800 text-zinc-300 transition hover:border-zinc-600 md:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-zinc-300 transition hover:text-white">
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="rounded-md bg-gold-500 px-3 py-1.5 font-semibold text-zinc-950 transition hover:bg-gold-400"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Menu mobile toàn màn hình: tài khoản + các mục của rail + logout */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-zinc-950 md:hidden">
          <div className="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
            <Logo onClick={closeMenu} />
            <button
              onClick={closeMenu}
              className="grid h-9 w-9 place-items-center rounded-md text-zinc-300 transition hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="px-2 py-2">
            {user ? (
              <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-4 text-sm text-zinc-400">
                <img
                  src={user.avatar || '/anonymous.png'}
                  alt=""
                  className="h-7 w-7 rounded-full bg-zinc-800 object-cover"
                />
                {user.username}
                {user.role === 'ADMIN' ? <StaffBadge /> : null}
              </div>
            ) : null}

            <MobileLink to="/" end onClick={closeMenu}>
              Dashboard
            </MobileLink>
            <MobileLink to="/leaderboard" onClick={closeMenu}>
              Leaderboard
            </MobileLink>
            {user ? (
              <MobileLink to={`/u/${user.username}`} onClick={closeMenu}>
                Profile
              </MobileLink>
            ) : null}
            {user && user.role !== 'ADMIN' ? (
              <MobileLink to="/submit" onClick={closeMenu} muted={submitBlocked}>
                Submit Report
              </MobileLink>
            ) : null}

            {user ? (
              <button
                onClick={handleLogout}
                className="flex w-full items-center justify-between border-b border-zinc-800 px-3 py-4 text-left text-sm font-medium uppercase tracking-wider text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
              >
                {loggingOut ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size="sm" /> Logging out…
                  </span>
                ) : (
                  'Logout'
                )}
                <ChevronRight className="h-4 w-4 text-zinc-600" />
              </button>
            ) : (
              <>
                <MobileLink to="/login" onClick={closeMenu}>
                  Log in
                </MobileLink>
                <MobileLink to="/register" onClick={closeMenu}>
                  Sign up
                </MobileLink>
              </>
            )}
          </nav>
        </div>
      ) : null}

      {/* Rail icon dính sát trái, chạy từ chân top bar xuống đáy màn hình */}
      <aside className="fixed bottom-0 left-0 top-14 z-10 hidden w-14 flex-col items-center gap-1.5 border-r border-zinc-800/70 bg-zinc-950 pt-3 md:flex">
        <NavLink to="/" end className={railItem} title="Dashboard" aria-label="Dashboard">
          <LineChart className="h-5 w-5" />
        </NavLink>
        <NavLink to="/leaderboard" className={railItem} title="Leaderboard" aria-label="Leaderboard">
          <Trophy className="h-5 w-5" />
        </NavLink>
        {user ? (
          <NavLink to={`/u/${user.username}`} className={railItem} title="Profile" aria-label="Profile">
            <UserRound className="h-5 w-5" />
          </NavLink>
        ) : null}
        {user && user.role !== 'ADMIN' ? (
          <NavLink
            to="/submit"
            className={(args) => `${railItem(args)}${submitBlocked ? ' opacity-40' : ''}`}
            title={submitBlocked ? 'Your Signal is negative — submissions are temporarily blocked' : 'Submit Report'}
            aria-label="Submit Report"
          >
            <FilePlus2 className="h-5 w-5" />
          </NavLink>
        ) : null}
      </aside>

      {/* Nội dung: chừa chỗ cho rail, căn giữa bề ngang đọc */}
      <div className="px-4 py-6 md:pl-20">
        <main className="mx-auto w-full max-w-5xl">
          {/* key theo pathname -> mỗi lần chuyển màn có animation fade nhẹ */}
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
