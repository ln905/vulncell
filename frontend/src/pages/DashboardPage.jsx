import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, buildQuery } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import ReportCard from '../components/ReportCard';
import FilterDrawer from '../components/FilterDrawer';
import Spinner from '../components/Spinner';
import {
  activeFilterCount,
  composeQueryText,
  disclosedTab,
  parseQuery,
  toApiParams,
} from '../lib/queryParser';

const PAGE_SIZE = 10;

export default function DashboardPage() {
  const { user } = useAuth();
  // null = người dùng chưa chỉnh tay -> dùng mặc định theo vai trò
  // (ADMIN mặc định xem Undisclosed, HACKER/khách xem Disclosed)
  const [text, setText] = useState(null);
  const [debouncedText, setDebouncedText] = useState(null);
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  // Keyset pagination: cursor của từng trang (trang 1 = null). Dùng khi sort = mới nhất.
  const [pageCursors, setPageCursors] = useState([null]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const defaultQuery = user?.role === 'ADMIN' ? 'disclosed:false' : 'disclosed:true';
  const activeText = text ?? defaultQuery;

  // gõ tới đâu chờ 350ms mới truy vấn (tránh spam API giữa lúc gõ)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(activeText), 350);
    return () => clearTimeout(timer);
  }, [activeText]);

  const filters = useMemo(() => parseQuery(debouncedText ?? activeText), [debouncedText, activeText]);
  const apiParams = useMemo(() => toApiParams(filters), [filters]);
  const tab = disclosedTab(filters);
  const filterCount = activeFilterCount(filters);

  useEffect(() => {
    setPage(1);
    setPageCursors([null]);
  }, [debouncedText, sort]);

  // Cursor cho trang hiện tại (chỉ áp dụng khi sắp xếp mới nhất -> keyset)
  const cursor = sort === 'newest' ? pageCursors[page - 1] : undefined;

  const reportsQuery = useQuery({
    queryKey: ['reports', { ...apiParams, sort, page, cursor }],
    queryFn: () => api.get(`/reports${buildQuery({ ...apiParams, sort, page, pageSize: PAGE_SIZE, cursor })}`),
    placeholderData: keepPreviousData,
  });

  // Facets nặng hơn nên chỉ gọi khi mở panel
  const facetsQuery = useQuery({
    queryKey: ['facets', apiParams],
    queryFn: () => api.get(`/reports/facets${buildQuery(apiParams)}`),
    enabled: drawerOpen,
    placeholderData: keepPreviousData,
  });

  const reports = reportsQuery.data || [];

  // Panel/kèm tab đổi filter -> compose lại chuỗi search
  const applyFilters = (next) => {
    const composed = composeQueryText(next);
    setText(composed);
    setDebouncedText(composed);
  };

  const switchTab = (next) => {
    const f = { ...filters, state: undefined, disclosed: next === 'disclosed' };
    applyFilters(f);
  };

  const goNext = () => {
    // Sort mới nhất -> keyset: cursor lấy từ phần tử cuối (createdAt + id), lưu lại cho từng trang
    if (sort === 'newest' && reports.length > 0) {
      const last = reports[reports.length - 1];
      const nextCursor = `${new Date(last.createdAt).toISOString()}_${last.id}`;
      setPageCursors((cs) => {
        const nc = cs.slice(0, page);
        nc[page] = nextCursor;
        return nc;
      });
    }
    setPage((p) => p + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Hacktivity</h1>
        <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 text-xs">
          <button
            onClick={() => switchTab('disclosed')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              tab === 'disclosed' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Disclosed
          </button>
          <button
            onClick={() => switchTab('undisclosed')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              tab === 'undisclosed' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Undisclosed
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={activeText}
          onChange={(e) => setText(e.target.value)}
          placeholder='Search: severity:HIGH weakness:("Reflected XSS") bounty:>=100 disclosed:true'
          className="min-w-64 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs outline-none transition focus:border-gold-500"
        />

        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-zinc-500"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-zinc-400">
            <path
              fillRule="evenodd"
              d="M2.628 1.601A6.25 6.25 0 0 1 9.25 1.75h1.5a6.25 6.25 0 0 1 6.622 6.75.75.75 0 0 1-.75.75H2.75a.75.75 0 0 1-.75-.75 6.25 6.25 0 0 1 .628-6.899ZM4 11.25h12v1.5H4v-1.5Zm2 3h8v1.5H6v-1.5Z"
              clipRule="evenodd"
            />
          </svg>
          Filters
          {filterCount > 0 ? (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-zinc-950">
              {filterCount}
            </span>
          ) : null}
        </button>

        <span className="self-center text-[11px] uppercase tracking-wide text-zinc-500">Sort</span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs text-zinc-200 outline-none focus:border-gold-500"
        >
          <option value="newest">Time: newest first</option>
          <option value="oldest">Time: oldest first</option>
        </select>
      </div>

      {reportsQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
          <Spinner /> Loading…
        </div>
      ) : reportsQuery.isError ? (
        <p className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Failed to load data: {reportsQuery.error.message}
        </p>
      ) : reports.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">No reports match the current filters.</p>
      ) : (
        <div className={`space-y-1.5 transition-opacity ${reportsQuery.isFetching ? 'opacity-60' : ''}`}>
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1 text-xs text-zinc-500">
        <span>Page {page}</span>
        <div className="flex gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-zinc-700 px-3 py-1.5 transition hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-30"
          >
            ← Previous
          </button>
          <button
            disabled={reports.length < PAGE_SIZE}
            onClick={goNext}
            className="rounded-md border border-zinc-700 px-3 py-1.5 transition hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      </div>

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        applyFilters={applyFilters}
        facets={facetsQuery.data}
        isLoading={facetsQuery.isLoading}
        isError={facetsQuery.isError}
        error={facetsQuery.error}
      />
    </div>
  );
}
