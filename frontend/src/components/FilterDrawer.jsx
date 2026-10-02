import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, buildQuery } from '../api/client';
import { stateLabel } from './badges';
import SeverityBars from './SeverityBars';
import Spinner from './Spinner';
import { isDisclosed } from '../lib/stateMachine';
import { toApiParams } from '../lib/queryParser';

const UNDISCLOSED_ORDER = ['NONE', 'PENDING', 'TRIAGED'];

function Section({ title, children }) {
  return (
    <section className="space-y-1 border-b border-zinc-800 pb-4">
      <h3 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

function OptionRow({ label, count, selected, onClick, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
        selected
          ? 'bg-gold-500/15 text-gold-300 ring-1 ring-inset ring-gold-700'
          : 'text-zinc-300 hover:bg-zinc-900'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className={`shrink-0 text-xs ${selected ? 'text-gold-300' : 'text-zinc-500'}`}>{count}</span>
    </button>
  );
}

const inputClass =
  'w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-gold-500';

// Weakness về sau sẽ rất nhiều loại -> không liệt kê cứng, mà tìm trong các giá trị
// ĐANG TỒN TẠI trong DB (endpoint /reports/weaknesses trả kèm số đếm).
function WeaknessSection({ filters, applyFilters, baseParams }) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const optionsQuery = useQuery({
    queryKey: ['weakness-options', baseParams, debounced],
    queryFn: () => api.get(`/reports/weaknesses${buildQuery({ ...baseParams, search: debounced || undefined })}`),
    placeholderData: keepPreviousData,
  });

  const options = optionsQuery.data || [];
  const selected = filters.weakness;

  return (
    <Section title="Weakness">
      <div className="px-1 pb-1">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search existing weaknesses…"
          className={inputClass}
        />
      </div>

      {selected ? (
        <OptionRow
          label={selected}
          count="selected"
          selected
          onClick={() => applyFilters({ ...filters, weakness: undefined })}
        />
      ) : null}

      {optionsQuery.isLoading && options.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500">
          <Spinner size="sm" /> Loading…
        </div>
      ) : null}

      {options
        .filter((o) => o.value !== selected)
        .map((w) => (
          <OptionRow key={w.value} label={w.value} count={w.count} onClick={() => applyFilters({ ...filters, weakness: w.value })} />
        ))}

      {!optionsQuery.isLoading && options.length === 0 ? (
        <p className="px-3 py-1 text-xs text-zinc-500">
          No weaknesses match{debounced ? ` “${debounced}”` : ''}.
        </p>
      ) : null}
    </Section>
  );
}

export default function FilterDrawer({ open, onClose, filters, applyFilters, facets, isLoading, isError, error }) {
  const [bountyMin, setBountyMin] = useState('');
  const [bountyMax, setBountyMax] = useState('');

  // đồng bộ input số tiền mỗi khi mở panel hoặc filter đổi từ bên ngoài
  useEffect(() => {
    setBountyMin(filters.bountyMin !== undefined ? String(filters.bountyMin) : '');
    setBountyMax(filters.bountyMax !== undefined ? String(filters.bountyMax) : '');
  }, [filters.bountyMin, filters.bountyMax, open]);

  const baseParams = useMemo(() => toApiParams(filters), [filters]);

  const select = (key, value) => {
    const next = { ...filters, [key]: filters[key] === value ? undefined : value };
    applyFilters(next);
  };

  const commitBounty = () => {
    const next = { ...filters };
    next.bountyMin = bountyMin.trim() === '' ? undefined : Math.max(0, Number(bountyMin) || 0);
    next.bountyMax = bountyMax.trim() === '' ? undefined : Math.max(0, Number(bountyMax) || 0);
    applyFilters(next);
  };

  const clearAll = () => applyFilters({ q: '', disclosed: true });

  const states = facets?.states || [];
  const undisclosedStates = states.filter((s) => UNDISCLOSED_ORDER.includes(s.value));
  const disclosedStates = states.filter((s) => isDisclosed(s.value));
  const severities = facets?.severities || [];
  const hasBountyData = facets && facets.bounty && facets.bounty.min !== null && facets.bounty.max !== null;

  return (
    <>
      {/* overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/60 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* panel trượt từ bên phải */}
      <aside
        className={`fixed right-0 top-0 z-40 flex h-full w-full max-w-sm transform flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Filters</h2>
            <p className="text-[11px] text-zinc-500">
              {isLoading ? 'Counting…' : facets ? `${facets.total} reports match` : 'Pick filters to narrow the list'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={clearAll} className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 transition hover:border-zinc-500">
              Clear all
            </button>
            <button onClick={onClose} className="rounded-md px-2 py-1 text-lg leading-none text-zinc-400 transition hover:text-white" aria-label="Close">
              ×
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {isError ? (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
              Failed to load filters: {error?.message}
            </p>
          ) : null}

          {!facets && isLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Spinner /> Loading filters…
            </div>
          ) : null}

          {facets ? (
            <>
              {undisclosedStates.length > 0 ? (
                <Section title="Status · Undisclosed">
                  {undisclosedStates.map((s) => (
                    <OptionRow
                      key={s.value}
                      label={stateLabel(s.value)}
                      count={s.count}
                      selected={filters.state === s.value}
                      onClick={() => select('state', s.value)}
                    />
                  ))}
                </Section>
              ) : null}

              {disclosedStates.length > 0 ? (
                <Section title="Status · Disclosed">
                  {disclosedStates.map((s) => (
                    <OptionRow
                      key={s.value}
                      label={stateLabel(s.value)}
                      count={s.count}
                      selected={filters.state === s.value}
                      onClick={() => select('state', s.value)}
                    />
                  ))}
                </Section>
              ) : null}

              {severities.length > 0 ? (
                <Section title="Severity">
                  {severities.map((s) => (
                    <OptionRow
                      key={s.value}
                      icon={<SeverityBars value={s.value} size="sm" />}
                      label={s.value}
                      count={s.count}
                      selected={filters.severity === s.value}
                      onClick={() => select('severity', s.value)}
                    />
                  ))}
                </Section>
              ) : null}

              <WeaknessSection filters={filters} applyFilters={applyFilters} baseParams={baseParams} />

              {hasBountyData ? (
                <Section title="Bounty ($)">
                  <div className="flex items-center gap-2 px-1">
                    <input
                      type="number"
                      min="0"
                      value={bountyMin}
                      onChange={(e) => setBountyMin(e.target.value)}
                      onBlur={commitBounty}
                      onKeyDown={(e) => e.key === 'Enter' && commitBounty()}
                      placeholder={`From (min ${facets.bounty.min})`}
                      className={inputClass}
                    />
                    <span className="text-zinc-600">—</span>
                    <input
                      type="number"
                      min="0"
                      value={bountyMax}
                      onChange={(e) => setBountyMax(e.target.value)}
                      onBlur={commitBounty}
                      onKeyDown={(e) => e.key === 'Enter' && commitBounty()}
                      placeholder={`To (max ${facets.bounty.max})`}
                      className={inputClass}
                    />
                  </div>
                  <p className="px-1 pt-1 text-[11px] text-zinc-600">Press Enter or leave the field to apply.</p>
                </Section>
              ) : null}

              {/* Chỉ hiện option đang có dữ liệu; nếu không còn gì thì báo rõ */}
              {severities.length === 0 && states.length === 0 && !hasBountyData ? (
                <p className="text-sm text-zinc-500">No filters have data under the current conditions.</p>
              ) : null}
            </>
          ) : null}
        </div>

        <footer className="border-t border-zinc-800 px-4 py-3 text-[11px] leading-relaxed text-zinc-500">
          Only filters with data are shown. Selections are written back into the search bar as query syntax for reuse.
        </footer>
      </aside>
    </>
  );
}
