import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';
import Constellation, { SHAPES } from '../components/Constellation';

// ------------------------------------------------------------------- landing

const NAV_LINKS = [
  ['For Founders', '#founders'],
  ['For Investors', '#investors'],
];

const PILLARS = [
  { n: '01', t: 'The 12-minute pitch', d: 'Every startup opens with a video pitch. No cold decks, no warm intro required — founders make their case directly.' },
  { n: '02', t: 'Permissioned data rooms', d: 'Decks, models, and cap tables stay behind founder-controlled access. Diligence happens on the platform, on the record.' },
  { n: '03', t: 'The Fundamental Score', d: 'A clear 0–100 rating across completeness, traction, engagement, and trust — one shared language for the market.' },
];

export default function Landing() {
  const [shape, setShape] = useState(SHAPES[0]);

  return (
    <div className="min-h-screen bg-black text-white safe-top safe-bottom" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 bg-black/85">
        <div className="max-w-[1200px] mx-auto px-6 h-[72px] flex items-center justify-between">
          <Logo className="h-[63px]" variant="dark" />
          {/* Anchor links stay reachable on mobile (the old hidden-below-md nav left
              phones with no way to the founder/investor sections). */}
          <nav className="flex items-center gap-4 md:gap-9" aria-label="Primary">
            {NAV_LINKS.map(([l, to]) => (
              to.startsWith('#')
                ? <a key={l} href={to} className="py-2 text-[13px] md:text-[14px] tracking-[0.021em] text-[#9a9a9a] hover:text-white transition-colors">{l}</a>
                : <Link key={l} to={to} className="hidden sm:inline py-2 text-[13px] md:text-[14px] tracking-[0.021em] text-[#9a9a9a] hover:text-white transition-colors">{l}</Link>
            ))}
          </nav>
          <Link to="/login"
            className="rounded-[24px] bg-[#8052ff] text-white text-[12px] font-semibold uppercase tracking-[0.05em] px-5 py-[15px] hover:bg-[#9066ff] transition-colors">
            Enter Fundamental
          </Link>
        </div>
      </header>

      <main>
        {/* Hero — 50/50: text block on the void, constellation owning the right */}
        <section className="max-w-[1200px] mx-auto px-6 pt-[120px] min-h-screen grid lg:grid-cols-2 items-center gap-[36px]">
          <div className="max-w-[480px] order-2 lg:order-1 pb-[60px] lg:pb-0">
            <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#8052ff] mb-[18px]">
              The serious way to raise and invest
            </div>
            <h1 className="font-extralight text-[clamp(40px,9.5vw,113px)] leading-[0.85] tracking-[-0.04em]">
              Fundraising?<br /><span className="text-[#8052ff]">Fundamental.</span>
            </h1>
            <p className="mt-[30px] text-[15px] leading-[1.5] tracking-[0.025em] text-[#bdbdbd] max-w-[44ch]">
              Fundamental is the serious fundraising platform and social network for startups
              and investors. Discover opportunities, build meaningful relationships, and raise
              capital with confidence.
            </p>
            <div className="mt-[36px] flex items-center gap-[15px] flex-wrap">
              <Link to="/login"
                className="rounded-[24px] bg-[#8052ff] text-white text-[12px] font-semibold uppercase tracking-[0.05em] px-6 py-[14px] hover:bg-[#9066ff] transition-colors">
                Raise or invest
              </Link>
              <Link to="/login"
                className="rounded-[24px] border border-[#ffb829] text-[#ffb829] text-[12px] font-semibold uppercase tracking-[0.05em] px-6 py-[14px] hover:bg-[#ffb829]/10 transition-colors">
                Watch the pitches
              </Link>
            </div>
          </div>

          <div className="order-1 lg:order-2 relative h-[46vh] lg:h-[78vh] lg:translate-x-10 lg:-translate-y-10">
            <Constellation onShape={setShape} />
            <div key={shape.label} className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center fade-in">
              <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#8052ff]">{shape.kicker}</div>
              <div className="text-[14px] tracking-[0.021em] text-[#9a9a9a] mt-1">{shape.label}</div>
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section id="founders" className="max-w-[1200px] mx-auto px-6 py-[60px]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-white mb-[12px]">How it works</div>
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

        {/* Value props — durable claims, not live counters that drift out of date */}
        <section id="investors" className="max-w-[1200px] mx-auto px-6 py-[60px]">
          <div className="rounded-[24px] border border-white/10 p-[36px] grid sm:grid-cols-3 gap-[30px] text-center">
            {[['12 min', 'to assess any deal'], ['100%', 'of pitches on video'], ['0', 'cold decks in your inbox']].map(([v, l]) => (
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
            Every idea<br />comes to life.
          </h2>
          <Link to="/login"
            className="inline-block mt-[36px] rounded-[24px] bg-[#8052ff] text-white text-[12px] font-semibold uppercase tracking-[0.05em] px-8 py-[14px] hover:bg-[#9066ff] transition-colors">
            Create account
          </Link>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="max-w-[1200px] mx-auto px-6 py-[30px] flex items-center justify-between flex-wrap gap-[12px]">
          <Logo className="h-[52px]" variant="dark" />
          <div className="text-[12px] tracking-[0.05em] text-[#9a9a9a]">The private-market network for founders and investors.</div>
          <nav className="flex items-center gap-5 flex-wrap" aria-label="Legal">
            {[['Terms of Service', '/legal/terms'], ['Privacy Policy', '/legal/privacy'], ['Risk Disclosures', '/legal/disclosures']].map(([l, to]) => (
              <Link key={to} to={to} className="text-[12px] tracking-[0.05em] text-[#9a9a9a] hover:text-white transition-colors">{l}</Link>
            ))}
          </nav>
        </div>
        <div className="max-w-[1200px] mx-auto px-6 pb-[24px] text-[11px] leading-[1.5] text-[#6a6a6a]">
          Information on Fundamental is provided by members and is not investment advice. Investing in private companies involves substantial risk, including total loss of capital.
        </div>
      </footer>
    </div>
  );
}
