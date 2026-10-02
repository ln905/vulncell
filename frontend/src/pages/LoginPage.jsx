import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Spinner from '../components/Spinner';

const inputClass =
  'w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-gold-500';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(identifier.trim(), password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      if (err.status === 401) setError('Wrong email/username or password.');
      else if (err.status === 429) setError(err.message);
      else setError(err.message || 'Could not log in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-xl font-bold">
          <img src="/logo.png" alt="VulnCell" className="h-8 w-8 object-contain" />
          VulnCell
        </Link>

        <h1 className="mb-4 text-center text-sm font-medium text-zinc-400">
          Log in to submit and track reports
        </h1>

        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className={inputClass}
            placeholder="Email or username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            className={inputClass}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error ? (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-gold-500 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-gold-400 disabled:opacity-50"
          >
            {busy ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="sm" tone="dark" /> Logging in…
              </span>
            ) : (
              'Log in'
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-zinc-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-gold-300 hover:underline">
            Sign up
          </Link>
        </p>

        <div className="mt-5 rounded-md border border-zinc-800 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-500">
          <p className="font-semibold text-zinc-400">Demo accounts:</p>
          <p>admin@vulncell.dev · reporter1@vulncell.dev</p>
          <p>Password: password123</p>
        </div>
      </div>
    </div>
  );
}
