import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, asArray, asObject, timeAgo } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar, BarBreakdown, CoverHero, Empty, ScoreRing, Spinner, VerifiedBadge, useToast } from '../components/ui';

const BADGE_STYLES = { 'Repeat Founder': 'chip-blue', 'Exited Founder': 'chip-gold', 'High Growth Founder': 'chip-green' };

export default function Profile() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const toast = useToast();
  const nav = useNavigate();

  const load = () => api.get(`/api/users/profile/${id}`).then(setD).catch(e => setErr(e.message));
  useEffect(() => { setD(null); setErr(null); load(); }, [id]);

  if (err) return <Empty title={err} />;
  if (!d) return <Spinner />;
  const u = d.user;
  const self = u.id === me.id;
  const investor = d.investor ? { ...asObject(d.investor), stage_focus: asArray(d.investor.stage_focus), sector_focus: asArray(d.investor.sector_focus) } : null;
  const userLinks = asArray(u.links);
  const userBadges = asArray(u.badges);
  const posts = asArray(d.posts);
  const activity = asArray(d.activity);
  const startups = asArray(d.startups);
  const portfolioStartups = asArray(d.portfolio_startups);

  const act = async (fn, ok) => { try { await fn(); ok && toast(ok, 'success'); load(); } catch (e) { toast(e.message, 'error'); } };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header with cover hero */}
      <CoverHero cover={u.cover} fallbackKey={u.name}>
        <div className="flex flex-col sm:flex-row gap-5 -mt-12 sm:-mt-14 relative">
          <div className="rounded-full p-1 bg-ink-900 w-fit shadow-lift shrink-0">
            <Avatar src={u.photo} name={u.name} size={22} />
          </div>
          <div className="flex-1 min-w-0 sm:pt-14">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="h-display text-2xl">{u.name}</h1>
              {!!u.verified && <VerifiedBadge tier={u.verified} />}
              <span className="chip capitalize">{u.role}</span>
              {d.trust && (
                <span className="chip-gold" title={`Trust Score — verification ${d.trust.breakdown.verification}/40 · profile ${d.trust.breakdown.profile}/30 · network ${d.trust.breakdown.network}/15 · contribution ${d.trust.breakdown.contribution}/15`}>
                  ⛨ Trust {d.trust.total}
                </span>
              )}
            </div>
            {u.headline && <div className="text-sm text-gold-300/90 font-medium mt-1">{u.headline}</div>}
            <div className="text-xs text-mist-400 mt-1">{u.city}{investor?.fund_name && ` · ${investor.fund_name}`}</div>
            {userBadges.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-3">
                {userBadges.map(b => <span key={b} className={BADGE_STYLES[b] || 'chip'}>★ {b}</span>)}
              </div>
            )}
            <div className="flex items-center gap-4 mt-3 text-sm">
              <span><span className="font-bold text-mist-100">{d.total_connections}</span> <span className="text-mist-400">connections</span></span>
              {!self && <span><span className="font-bold text-mist-100">{d.mutual_connections}</span> <span className="text-mist-400">mutual</span></span>}
            </div>
          </div>
        </div>
        {!self && (
          <div className="flex gap-2 flex-wrap mt-5 pt-5 border-t border-ink-700/60">
            {d.connected ? (
              <button className="btn-primary btn-sm" onClick={() => act(async () => {
                const r = await api.post(`/api/messages/start/${u.id}`); nav(`/messages?c=${r.conversation_id}`);
              })}>Message</button>
            ) : d.connection_status === 'pending' && d.connection_direction === 'incoming' ? (
              <>
                <button className="btn-primary btn-sm" onClick={() => act(() => api.post(`/api/users/connections/${d.connection_id}/accept`), 'Connected — messaging is now open')}>Accept request</button>
                <button className="btn-danger btn-sm" onClick={() => act(() => api.post(`/api/users/connections/${d.connection_id}/reject`))}>Reject</button>
              </>
            ) : (
              <button className="btn-primary btn-sm" disabled={d.connection_status === 'pending'}
                onClick={() => act(() => api.post(`/api/users/connect/${u.id}`), 'Connection request sent')}>
                {d.connection_status === 'pending' ? 'Request pending' : 'Connect'}
              </button>
            )}
            <button className={`btn-ghost btn-sm ${d.following ? '!text-gold-300 !border-gold-500/40' : ''}`}
              onClick={() => act(() => api.post(`/api/users/follow/${u.id}`))}>{d.following ? '✓ Following' : 'Follow'}</button>
            {u.linkedin && <a href={u.linkedin} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">LinkedIn ↗</a>}
            <button className="btn-ghost btn-sm ml-auto !text-mist-500" onClick={() => {
              const reason = prompt('Report this profile — describe the issue:');
              if (reason) act(() => api.post('/api/users/report', { target_type: 'user', target_id: u.id, reason }), 'Report sent to our moderation team');
            }}>Report</button>
          </div>
        )}
      </CoverHero>

      {/* Investor: fund header + thesis */}
      {u.role === 'investor' && investor && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[['Fund', investor.fund_name || '—'], ['Fund Size', investor.fund_size || '—'], ['Check Size', investor.check_size || '—'],
              ['Focus', [...investor.stage_focus, ...investor.sector_focus].slice(0, 3).join(', ') || '—']].map(([k, v]) => (
              <div key={k} className="card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-mist-500">{k}</div>
                <div className="text-sm font-semibold text-mist-100 mt-1 leading-snug">{v}</div>
              </div>
            ))}
          </div>
          {investor.thesis && (
            <div className="card p-6">
              <h2 className="section-title mb-3">Investment thesis</h2>
              <p className="text-[15px] text-mist-200 leading-relaxed">“{investor.thesis}”</p>
              <div className="flex gap-2 flex-wrap mt-4">
                {investor.sector_focus.map(s => <span key={s} className="chip-gold">{s}</span>)}
                {investor.stage_focus.map(s => <span key={s} className="chip">{s}</span>)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Investor visual intelligence — aggregate attention, never confidential data */}
      {u.role === 'investor' && (d.interest_allocation?.length > 0 || d.stage_allocation?.length > 0) && (
        <div className="card p-6">
          <h2 className="section-title mb-1">Where their attention goes</h2>
          <p className="text-xs text-mist-500 mb-5">Drawn from aggregate activity on Fundamental — conviction signals and pipeline composition.</p>
          <div className="grid sm:grid-cols-2 gap-8">
            {d.interest_allocation?.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-mist-500 mb-3">Sector conviction</div>
                <BarBreakdown items={d.interest_allocation} />
              </div>
            )}
            {d.stage_allocation?.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-mist-500 mb-3">Pipeline by stage</div>
                <BarBreakdown items={d.stage_allocation} />
              </div>
            )}
          </div>
          {d.activity_stats && (
            <div className="flex gap-6 mt-6 pt-4 border-t border-ink-700/50 text-sm">
              <span><span className="font-display font-bold text-mist-100">{d.activity_stats.upvotes}</span> <span className="text-mist-400">conviction votes</span></span>
              <span><span className="font-display font-bold text-mist-100">{d.activity_stats.pipeline}</span> <span className="text-mist-400">in pipeline</span></span>
              <span><span className="font-display font-bold text-mist-100">{d.activity_stats.posts}</span> <span className="text-mist-400">insights shared</span></span>
            </div>
          )}
        </div>
      )}

      {/* About */}
      {(u.bio || u.experience || u.education) && (
        <div className="card p-6">
          <h2 className="section-title mb-4">About</h2>
          {u.bio && <p className="text-sm text-mist-200 leading-relaxed">{u.bio}</p>}
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            {u.experience && <div><div className="text-[11px] font-semibold uppercase tracking-wider text-mist-500">Experience</div><div className="text-sm text-mist-300 mt-1">{u.experience}</div></div>}
            {u.education && <div><div className="text-[11px] font-semibold uppercase tracking-wider text-mist-500">Education</div><div className="text-sm text-mist-300 mt-1">{u.education}</div></div>}
          </div>
        </div>
      )}

      {/* Links */}
      {userLinks.length > 0 && (
        <div className="card p-6">
          <h2 className="section-title mb-4">Links</h2>
          <div className="flex flex-wrap gap-2">
            {userLinks.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noreferrer noopener"
                className="btn-ghost btn-sm max-w-full truncate">
                {(l.label || l.url.replace(/^https?:\/\/(www\.)?/, '')).slice(0, 60)} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Startups / Portfolio */}
      {(startups.length > 0 || portfolioStartups.length > 0) && (
        <div className="card p-6">
          <h2 className="section-title mb-4">{u.role === 'founder' ? 'Startups' : 'Portfolio'}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {(startups.length > 0 ? startups : portfolioStartups).map(s => (
              <Link key={s.id} to={`/startup/${s.id}`} className="flex items-center gap-3 bg-ink-850 border border-ink-700/60 rounded-xl p-3.5 hover:border-ink-500 transition-colors">
                <Avatar src={s.logo} name={s.name} size={11} square />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-mist-100">{s.name}{!!s.verified && <VerifiedBadge small />}</div>
                  <div className="text-xs text-mist-400">{s.sector} · {s.stage}</div>
                  {s.one_liner && <div className="text-xs text-mist-500 truncate mt-0.5">{s.one_liner}</div>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Activity */}
      <div className="card p-6">
        <h2 className="section-title mb-4">Activity</h2>
        {activity.length === 0 && posts.length === 0 ? (
          <div className="text-sm text-mist-500">No activity yet.</div>
        ) : (
          <div className="space-y-4">
            {activity.map(a => (
              <div key={'a' + a.id} className="flex gap-3 items-start">
                <span className="chip-gold shrink-0 mt-0.5">{a.type}</span>
                <div><div className="text-sm text-mist-200">{a.text}</div><div className="text-[11px] text-mist-500">{a.startup_name} · {timeAgo(a.created_at)}</div></div>
              </div>
            ))}
            {posts.map(p => (
              <div key={'p' + p.id} className="flex gap-3 items-start">
                <span className="chip-blue shrink-0 mt-0.5">{p.type}</span>
                <div><div className="text-sm text-mist-200 line-clamp-2">{p.text}</div><div className="text-[11px] text-mist-500">{p.likes} likes · {p.comments} comments · {timeAgo(p.created_at)}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
