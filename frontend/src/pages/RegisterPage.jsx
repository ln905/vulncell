import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Spinner from '../components/Spinner';

const inputClass =
  'w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-gold-500';

export function passwordProblem(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain a digit.';
  return null;
}

export default function RegisterPage() {
  const { register, login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const usernameOk = /^[a-z0-9_]{3,30}$/.test(form.username);
  const passProblem = passwordProblem(form.password);
  const confirmOk = form.confirm.length > 0 && form.confirm === form.password;
  const canSubmit = usernameOk && form.email.includes('@') && !passProblem && confirmOk && !busy;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { username, email, password } = form;
      await register({ username, email, password });
      await login(email, password); // đăng ký xong đăng nhập luôn
      navigate('/', { replace: true });
    } catch (err) {
      if (err.status === 409) setError('Username or email is already taken.');
      else setError(err.message || 'Could not sign up.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4 py-8">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-xl font-bold">
          <img src="/logo.png" alt="VulnCell" className="h-8 w-8 object-contain" />
          VulnCell
        </Link>

        <h1 className="mb-4 text-center text-sm font-medium text-zinc-400">Create a Hacker account</h1>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <input className={inputClass} placeholder="Username (a-z, 0-9, _)" value={form.username} onChange={set('username')} required />
            {form.username && !usernameOk ? (
              <p className="mt-1 text-[11px] text-amber-400">3–30 characters: a-z, 0-9 and _ only</p>
            ) : null}
          </div>

          <input className={inputClass} type="email" placeholder="Email" value={form.email} onChange={set('email')} required />

          <div>
            <input className={inputClass} type="password" placeholder="Password" value={form.password} onChange={set('password')} required />
            {form.password && passProblem ? <p className="mt-1 text-[11px] text-amber-400">{passProblem}</p> : null}
          </div>

          <div>
            <input className={inputClass} type="password" placeholder="Confirm password" value={form.confirm} onChange={set('confirm')} required />
            {form.confirm && !confirmOk ? <p className="mt-1 text-[11px] text-amber-400">Passwords do not match.</p> : null}
          </div>

          {error ? (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-md bg-gold-500 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Spinner size="sm" tone="dark" /> Creating…
              </span>
            ) : (
              'Sign up'
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-zinc-500">
          Already have an account?{' '}
          <Link to="/login" className="text-gold-300 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
