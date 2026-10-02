import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import ReportCard from '../components/ReportCard';
import { StaffBadge } from '../components/badges';
import Spinner from '../components/Spinner';

function Stat({ label, value, accent = 'text-zinc-100' }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${accent}`}>{value}</p>
    </div>
  );
}

// Nén ảnh về 256×256 (crop giữa) ngay trên trình duyệt trước khi gửi lên —
// payload nhỏ, DB nhẹ, ảnh gốc không bao giờ rời máy người dùng.
function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const SIZE = 256;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(SIZE / img.width, SIZE / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

const inputClass =
  'w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-gold-500';

function ProfileEditor({ profile, onClose }) {
  const queryClient = useQueryClient();
  const [avatar, setAvatar] = useState(profile.avatar || null);
  const [bio, setBio] = useState(profile.bio || '');
  const [error, setError] = useState('');

  const saveMutation = useMutation({
    mutationFn: (payload) => api.patch('/users/me', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', profile.username] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      onClose();
    },
    onError: (err) =>
      setError(
        err.status === 401
          ? 'Your session expired — please log in again.'
          : err.message || 'Could not save your profile.'
      ),
  });

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (PNG, JPEG or WebP).');
      return;
    }
    try {
      setAvatar(await fileToAvatar(file));
      setError('');
    } catch (err) {
      setError(err.message);
    }
    e.target.value = ''; // cho phép chọn lại đúng file vừa rồi
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold">Edit profile</h2>

        <div className="mt-4 flex items-center gap-4">
          <img
            src={avatar || '/anonymous.png'}
            alt="Avatar preview"
            className="h-16 w-16 rounded-full bg-zinc-800 object-cover"
          />
          <div className="flex flex-col gap-1.5">
            <label className="cursor-pointer rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-gold-500 hover:text-gold-300">
              Upload image
              <input type="file" accept="image/*" className="hidden" onChange={pickFile} />
            </label>
            {avatar ? (
              <button
                type="button"
                onClick={() => setAvatar(null)}
                className="text-left text-xs text-zinc-500 transition hover:text-red-400"
              >
                Remove image
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-zinc-600">Images are resized to 256×256 in your browser before upload.</p>

        <label className="mt-4 block text-xs text-zinc-400" htmlFor="profile-bio">
          Bio
        </label>
        <textarea
          id="profile-bio"
          rows={3}
          maxLength={160}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Say something about yourself…"
          className={`mt-1 resize-none ${inputClass}`}
        />
        <p className="mt-1 text-right text-[11px] text-zinc-600">{bio.length}/160</p>

        {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-xs text-zinc-400 transition hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate({ avatar, bio: bio.trim() || null })}
            disabled={saveMutation.isPending}
            className="rounded-md bg-gold-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-gold-400 disabled:opacity-40"
          >
            {saveMutation.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="sm" tone="dark" /> Saving…
              </span>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { username } = useParams();
  const [editing, setEditing] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => api.get(`/users/${encodeURIComponent(username)}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
        <Spinner /> Loading profile…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-16 text-center text-sm">
        <p className="text-red-400">
          {error.status === 404 ? `Hacker "${username}" not found.` : `Error: ${error.message}`}
        </p>
        <Link to="/" className="mt-3 inline-block text-gold-300 hover:underline">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const profile = data;
  const joined = new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Cột trái — Identity + Stats */}
      <aside className="w-full shrink-0 space-y-4 lg:w-72">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-center">
          <img
            src={profile.avatar || '/anonymous.png'}
            alt={`${profile.username}'s avatar`}
            className="mx-auto h-20 w-20 rounded-full bg-zinc-800 object-cover"
          />

          <h1 className="mt-3 text-lg font-bold">{profile.username}</h1>
          <p className="mt-1 flex items-center justify-center gap-2 text-xs text-zinc-500">
            {profile.role === 'ADMIN' ? (
              <StaffBadge />
            ) : (
              <span className="rounded bg-zinc-700/50 px-1.5 py-0.5 font-semibold text-zinc-300">HACKER</span>
            )}
          </p>

          {profile.bio ? (
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">{profile.bio}</p>
          ) : profile.isOwner ? (
            <p className="mt-2 text-xs text-zinc-600">No bio yet — add one to introduce yourself.</p>
          ) : null}

          <p className="mt-3 text-xs text-zinc-500">Joined {joined}</p>

          {profile.isOwner ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-3 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-gold-500 hover:text-gold-300"
            >
              Edit profile
            </button>
          ) : null}
        </div>

        <div className="space-y-2">
          <Stat label="Reputation" value={profile.reputation} />
          <Stat label="Signal (365 days)" value={profile.signal} accent={profile.signal < 0 ? 'text-red-400' : 'text-emerald-400'} />
          <Stat label="Total Bounties" value={`$${profile.totalBounty.toLocaleString('en-US')}`} accent="text-emerald-400" />
        </div>
      </aside>

      {/* Cột phải — Hacktivity */}
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Hacktivity</h2>
          <span className="text-xs text-zinc-500">{profile.reports.length} most recent reports</span>
        </div>

        {profile.isOwner ? (
          <p className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[11px] text-zinc-500">
            This is your profile — in-progress and private reports are only visible to you and admins.
          </p>
        ) : null}

        {profile.reports.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 py-10 text-center text-sm text-zinc-500">
            {profile.isOwner ? 'You have not submitted any reports yet.' : 'No public reports yet.'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {profile.reports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
        )}
      </div>

      {editing ? <ProfileEditor profile={profile} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}
