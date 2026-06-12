import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';
import Constellation, { SHAPES } from '../components/Constellation';

// ------------------------------------------------------------------- landing

const NAV_LINKS = [
  ['Discover', '/login'],
  ['For Founders', '#founders'],
  ['For Investors', '#investors'],
];

const PILLARS = [
  { n: '01', t: 'The 12-minute pitch', d: 'Every startup opens with a mandatory video pitch. No cold decks, no warm intros required — the work speaks first.' },
  { n: '02', t: 'Permissioned data rooms', d: 'Decks, models and cap tables behind founder-controlled access. Diligence happens on the platform, on the record.' },
  { n: '03', t: 'The Fundamental Score', d: 'An explainable 0–100 score across completeness, traction, engagement and trust. The market\'s shared language.' },
];

export default function Landing() {
  const [shape, setShape] = useState(SHAPES[0]);

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 bg-black/85">
        <div className="max-w-[1200px] mx-auto px-6 h-[72px] flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-9">
            {NAV_LINKS.map(([l, to]) => (
              to.startsWith('#')
                ? <a key={l} href={to} className="text-[14px] tracking-[0.021em] text-[#9a9a9a] hover:text-white transition-colors">{l}</a>
                : <Link key={l} to={to} className="text-[14px] tracking-[0.021em] text-[#9a9a9a] hover:text-white transition-colors">{l}</Link>
            ))}
          </nav>
          <Link to="/login"
            className="rounded-[24px] bg-[#8052ff] text-white text-[12px] font-semibold uppercase tracking-[0.05em] px-5 py-[12px] hover:bg-[#9066ff] transition-colors">
            Enter Fundamental
          </Link>
        </div>
      </header>

      {/* Hero — 50/50: text block on the void, constellation owning the right */}
      <section className="max-w-[1200px] mx-auto px-6 pt-[120px] min-h-screen grid lg:grid-cols-2 items-center gap-[36px]">
        <div className="max-w-[480px] order-2 lg:order-1 pb-[60px] lg:pb-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#8052ff] mb-[18px]">
            Stop pitching into the void. Start raising in it.
          </div>
          <h1 className="font-extralight text-[clamp(56px,9vw,113px)] leading-[0.85] tracking-[-0.04em]">
            Every idea<br />becomes<br />a company.
          </h1>
          <p className="mt-[30px] text-[15px] leading-[1.5] tracking-[0.025em] text-[#bdbdbd] max-w-[42ch]">
            Fundamental is the serious fundraising marketplace. A 12-minute video pitch,
            structured metrics and a permissioned data room on every startup — for investors
            who do real diligence, from first contact to term sheet.
          </p>
          <div className="mt-[36px] flex items-center gap-[15px] flex-wrap">
            <Link to="/login"
              className="rounded-[24px] bg-[#8052ff] text-white text-[12px] font-semibold uppercase tracking-[0.05em] px-6 py-[14px] hover:bg-[#9066ff] transition-colors">
              Raise or Invest
            </Link>
            <Link to="/login"
              className="rounded-[24px] border border-[#ffb829] text-[#ffb829] text-[12px] font-semibold uppercase tracking-[0.05em] px-6 py-[14px] hover:bg-[#ffb829]/10 transition-colors">
              Watch the pitches
            </Link>
          </div>
        </div>

        <div className="order-1 lg:order-2 relative h-[46vh] lg:h-[78vh]">
          <Constellation onShape={setShape} />
          <div key={shape.label} className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center fade-in">
            <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#8052ff]">{shape.kicker}</div>
            <div className="text-[14px] tracking-[0.021em] text-[#9a9a9a] mt-1">{shape.label}</div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section id="founders" className="max-w-[1200px] mx-auto px-6 py-[60px]">
        <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-white mb-[12px]">The system</div>
        <h2 className="font-extralight text-[clamp(36px,5vw,78px)] leading-[0.9] tracking-[-0.04em] mb-[60px]">
          Built for diligence,<br />not noise.
        </h2>
        <div className="grid md:grid-cols-3 gap-[24px]">
          {PILLARS.map(p => (
            <div key={p.n} className="rounded-[24px] border border-white/10 p-[24px]">
              <div className="text-[12px] font-semibold tracking-[0.05em] text-[#8052ff]">{p.n}</div>
              <h3 className="text-[24px] leading-[1.3] tracking-[0.021em] font-semibold mt-[18px]">{p.t}</h3>
              <p className="text-[15px] leading-[1.5] tracking-[0.025em] text-[#9a9a9a] mt-[12px]">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section id="investors" className="max-w-[1200px] mx-auto px-6 py-[60px]">
        <div className="rounded-[24px] border border-white/10 p-[36px] grid sm:grid-cols-3 gap-[30px] text-center">
          {[['8+', 'startups raising now'], ['$39M+', 'in open rounds'], ['12 min', 'to know if it\'s a deal']].map(([v, l]) => (
            <div key={l}>
              <div className="font-extralight text-[48px] leading-[1.1] tracking-[-0.04em]">{v}</div>
              <div className="text-[12px] uppercase tracking-[0.05em] text-[#9a9a9a] mt-[6px]">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-[1200px] mx-auto px-6 py-[96px] text-center">
        <h2 className="font-extralight text-[clamp(42px,6vw,78px)] leading-[0.9] tracking-[-0.04em]">
          Fundraising?<br />Fundamental.
        </h2>
        <Link to="/login"
          className="inline-block mt-[36px] rounded-[24px] bg-[#8052ff] text-white text-[12px] font-semibold uppercase tracking-[0.05em] px-8 py-[14px] hover:bg-[#9066ff] transition-colors">
          Create your account
        </Link>
      </section>

      <footer className="border-t border-white/10">
        <div className="max-w-[1200px] mx-auto px-6 py-[30px] flex items-center justify-between flex-wrap gap-[12px]">
          <Logo />
          <div className="text-[12px] tracking-[0.05em] text-[#9a9a9a]">A professional network for founders and investors. No noise. No casual posting.</div>
        </div>
      </footer>
    </div>
  );
}
