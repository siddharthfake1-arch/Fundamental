import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { api, asArray, asObject } from '../api';
import StartupCard from '../components/StartupCard';
import Constellation from '../components/Constellation';
import { Avatar, Empty, Modal, Spinner, VerifiedBadge, useToast } from '../components/ui';
import PullToRefresh from '../components/PullToRefresh';

function TrendingStrip({ startups }) {
  const trending = [...asArray(startups)].sort((a, b) => b.momentum - a.momentum).slice(0, 5).filter(s => s.momentum > 0);
  if (trending.length < 2) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Flame className="w-4 h-4 text-orange-400" />
        <span className="section-title !text-orange-400">Trending this week</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {trending.map((s, i) => (
          <motion.div key={s.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}>
            <Link to={`/startup/${s.id}`}
              className="card ring-gradient card-hover flex items-center gap-3 px-4 py-3 min-w-[230px]">
              <span className="font-display font-extrabold text-lg text-gradient w-6">{i + 1}</span>
              <Avatar src={s.logo} name={s.name} size={10} square />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-mist-100 truncate">{s.name}{!!s.verified && <VerifiedBadge small />}</div>
                <div className="text-[11px] text-mist-400">{s.sector} · ▲ {s.upvotes} · {s.momentum} momentum</div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const EMPTY_FILTERS = { sector: '', subsector: '', stage: '', revenue: '', geography: '', raising: '', verified: false, q: '' };
const REVENUE_BANDS = [['', 'Any revenue'], ['0-100k', '$0 – $100K'], ['100k-1m', '$100K – $1M'], ['1m-10m', '$1M – $10M'], ['10m+', '$10M+']];

const PAGE = 30;

export default function Discover() {
  const [params, setParams] = useSearchParams();
  // F-019: initialize filters/sort from the URL so internal links like
  // /discover?sector=Fintech actually apply.
  const [filters, setFilters] = useState(() => {
    const f = { ...EMPTY_FILTERS };
    for (const k of Object.keys(EMPTY_FILTERS)) {
      const v = params.get(k);
      if (v != null) f[k] = k === 'verified' ? v === 'true' : v;
    }
    return f;
  });
  const [sort, setSort] = useState(() => params.get('sort') || 'recent');
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [facets, setFacets] = useState({ sectors: [], subsectors: [], stages: [], cities: [] });
  const [saved, setSaved] = useState([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const toast = useToast();

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    p.set('sort', sort);
    return p.toString();
  }, [filters, sort]);

  useEffect(() => {
    api.get('/api/startups/facets').then(setFacets).catch(() => {});
    loadSaved();
  }, []);
  // Keep the URL in sync with the active filters/sort (F-019).
  useEffect(() => { setParams(new URLSearchParams(qs), { replace: true }); }, [qs]);
  useEffect(() => {
    let alive = true;
    setData(null);
    api.get(`/api/startups?${qs}&limit=${PAGE}&offset=0`).then(d => { if (alive) { setData(d); setItems(asArray(d.startups)); } }).catch(e => toast(e.message, 'error'));
    return () => { alive = false; };
  }, [qs]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const d = await api.get(`/api/startups?${qs}&limit=${PAGE}&offset=${items.length}`);
      setItems(prev => [...prev, ...asArray(d.startups)]);
    } catch (e) { toast(e.message, 'error'); } finally { setLoadingMore(false); }
  };

  const loadSaved = () => api.get('/api/startups/saved-searches').then(d => setSaved(asArray(d.searches))).catch(() => {});

  const set = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const active = Object.entries(filters).filter(([, v]) => v).length;

  const Select = ({ k, options, placeholder, label }) => (
    <select className="input" id={`f-${k}`} aria-label={label || placeholder} value={filters[k]} onChange={set(k)}>
      <option value="">{placeholder}</option>
      {asArray(options).map(o => <option key={o}>{o}</option>)}
    </select>
  );

  const sidebar = (
    <div className="space-y-4">
      <div><label className="label" htmlFor="f-q">Search</label><input id="f-q" className="input" value={filters.q} onChange={set('q')} placeholder="Name or keyword" /></div>
      <div><label className="label" htmlFor="f-sector">Sector</label><Select k="sector" options={facets.sectors} placeholder="All sectors" label="Sector" /></div>
      <div><label className="label" htmlFor="f-subsector">Sub-sector</label><Select k="subsector" options={facets.subsectors} placeholder="All sub-sectors" label="Sub-sector" /></div>
      <div><label className="label" htmlFor="f-stage">Stage</label><Select k="stage" options={facets.stages} placeholder="All stages" label="Stage" /></div>
      <div><label className="label" htmlFor="f-revenue">Revenue</label>
        <select id="f-revenue" aria-label="Revenue" className="input" value={filters.revenue} onChange={set('revenue')}>
          {REVENUE_BANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div><label className="label" htmlFor="f-geography">Geography</label><Select k="geography" options={facets.cities} placeholder="All cities" label="Geography" /></div>
      <div><label className="label" htmlFor="f-raising">Raising status</label>
        <select id="f-raising" aria-label="Raising status" className="input" value={filters.raising} onChange={set('raising')}>
          <option value="">Any status</option>
          {['Actively Raising', 'Round Closing', 'Not Raising'].map(o => <option key={o}>{o}</option>)}
        </select>
      </div>
      <label className="flex items-center justify-between cursor-pointer card !rounded-xl px-3.5 py-3">
        <span className="text-sm font-medium text-mist-200">Verified only</span>
        <input type="checkbox" checked={filters.verified} onChange={set('verified')} className="accent-gold-400 w-4 h-4" />
      </label>
      <div className="flex gap-2">
        <button className="btn-ghost btn-sm flex-1" onClick={() => setFilters(EMPTY_FILTERS)}>Reset filters</button>
        <button className="btn-primary btn-sm flex-1" onClick={() => setSaveOpen(true)} disabled={!active}>Save search</button>
      </div>
      {saved.length > 0 && (
        <div>
          <span className="label">Saved searches</span>
          <div className="space-y-1.5">
            {saved.map(s => (
              <div key={s.id} className="flex items-center gap-2 card !rounded-lg px-3 py-2">
                <button className="text-sm text-mist-200 hover:text-gold-300 flex-1 text-left truncate"
                  onClick={() => { setFilters({ ...EMPTY_FILTERS, ...asObject(asObject(s.params).filters) }); setSort(asObject(s.params).sort || 'recent'); setFiltersOpen(false); }}>
                  {s.name}
                </button>
                <button className="text-mist-500 hover:text-red-400 text-xs" aria-label={`Delete saved search ${s.name}`} onClick={async () => { await api.del(`/api/startups/saved-searches/${s.id}`); loadSaved(); }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <PullToRefresh onRefresh={async () => { const d = await api.get(`/api/startups?${qs}&limit=${PAGE}&offset=0`); setData(d); setItems(asArray(d.startups)); }}>
    <div className="fade-in overflow-x-clip">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-4">
          {/* Live brand mark — the same morphing constellation from the landing page */}
          <div className="hidden sm:block w-[84px] h-[84px] shrink-0" title="Every idea becomes a company">
            <Constellation count={320} cycleMs={3000} />
          </div>
          <div>
            <h1 className="h-display text-2xl">Discover</h1>
            <p className="text-sm text-mist-400 mt-1">Every startup here opens with a 12-minute pitch — watch it before you reach out. <Link to="/startups" className="text-gold-300 hover:text-gold-200">Index view →</Link></p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="lg:hidden btn-ghost btn-sm" onClick={() => setFiltersOpen(o => !o)}>Filters{active ? ` (${active})` : ''}</button>
          <span className="text-xs text-mist-500 hidden sm:block">Sort</span>
          <select className="input !w-auto !py-2" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Recent</option>
            <option value="upvoted">Most upvoted</option>
            <option value="viewed">Most viewed</option>
            <option value="score">Highest score</option>
            <option value="fit">Best thesis fit</option>
          </select>
        </div>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr] gap-6 items-start">
        <aside className={`card p-4 lg:sticky lg:top-20 ${filtersOpen ? '' : 'hidden lg:block'}`}>{sidebar}</aside>
        <div className="min-w-0">
          {data && <TrendingStrip startups={items} />}
          {!data ? <Spinner /> : items.length === 0 ? (
            <Empty title="No startups match these filters" sub="Widen your criteria, or save this search to be notified when a match lists." />
          ) : (
            <>
              <div className="text-xs text-mist-500 mb-3">Showing {items.length} of {data.total} startup{data.total !== 1 ? 's' : ''}</div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((s, i) => (
                  <motion.div key={s.id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: Math.min(i % PAGE, 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full">
                    <StartupCard s={s} />
                  </motion.div>
                ))}
              </div>
              {items.length < data.total && (
                <div className="flex justify-center mt-6">
                  <button className="btn-ghost" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : `Load more (${data.total - items.length} more)`}</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save this search">
        <div className="space-y-4">
          <input className="input" autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Seed fintech in India" />
          <button className="btn-primary w-full" disabled={!saveName}
            onClick={async () => {
              try {
                await api.post('/api/startups/saved-searches', { name: saveName, params: { filters, sort } });
                setSaveOpen(false); setSaveName(''); loadSaved(); toast('Search saved', 'success');
              } catch (e) { toast(e.message, 'error'); }
            }}>Save search</button>
        </div>
      </Modal>
    </div>
    </PullToRefresh>
  );
}
