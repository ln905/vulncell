import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import Avatar from '../components/Avatar';
import Spinner from '../components/Spinner';

const RANK_STYLE = {
  1: 'text-amber-400',
  2: 'text-zinc-300',
  3: 'text-amber-700',
};

export default function LeaderboardPage() {
  const [sortBy, setSortBy] = useState('reputation');

  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ['leaderboard', sortBy],
    queryFn: () => api.get(`/leaderboard?sortBy=${sortBy}`),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">VulnCell Leaderboard</h1>
          <p className="mt-1 text-sm text-zinc-400">Top 50 hackers by all-time points — cached for 60 seconds.</p>
        </div>

        <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 text-xs">
          <button
            onClick={() => setSortBy('reputation')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              sortBy === 'reputation' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Reputation
          </button>
          <button
            onClick={() => setSortBy('signal')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              sortBy === 'signal' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Signal
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
          <Spinner /> Loading leaderboard…
        </div>
      ) : isError ? (
        <p className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-300">Error: {error.message}</p>
      ) : data.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">No one has earned points yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/70 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Hacker</th>
                <th className="px-4 py-3 text-right">Reputation</th>
                <th className="px-4 py-3 text-right" title="Points earned in the last 365 days">
                  Signal <span className="cursor-help normal-case text-zinc-600">ⓘ</span>
                </th>
                <th className="px-4 py-3 text-right">Total Bounty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {data.map((row) => (
                <tr key={row.userId} className="transition hover:bg-zinc-900/50">
                  <td className={`px-4 py-3 font-mono font-semibold ${RANK_STYLE[row.rank] || 'text-zinc-500'}`}>{row.rank}</td>
                  <td className="px-4 py-3">
                    <Link to={`/u/${row.username}`} className="flex items-center gap-2 font-medium text-zinc-200 hover:text-gold-300">
                      <Avatar username={row.username} sizeClass="h-6 w-6" />
                      {row.username}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-100">{row.reputation}</td>
                  <td className={`px-4 py-3 text-right ${row.signal < 0 ? 'text-red-400' : 'text-zinc-300'}`}>{row.signal}</td>
                  <td className="px-4 py-3 text-right text-emerald-400">
                    {row.totalBounty ? `$${row.totalBounty.toLocaleString('en-US')}` : <span className="text-zinc-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Reputation = all-time points · Signal = points earned in the last 365 days (decays when inactive) · Bounty is awarded only
        for <b>Resolved</b> reports.
      </p>
    </div>
  );
}
