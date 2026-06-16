// Seeds Fundamental with realistic demo data so the platform is fully explorable on first run.
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { db, addActivity } = require('./db');

if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) {
  console.log('Database already seeded — skipping. Delete server/fundamental.db to reseed.');
  process.exit(0);
}

const PASS = bcrypt.hashSync('demo1234', 10);
const { UPLOAD_DIR: UP } = require('./paths');
fs.mkdirSync(UP, { recursive: true });

// ---- Brand-style logo marks: gradient tile + abstract glyph (no letters) ----
const GLYPHS = [
  // bolt (fintech)
  '<path d="M112 30 L68 112 H98 L86 170 L136 86 H106 Z" fill="#fff" opacity="0.95"/>',
  // pulse (health)
  '<path d="M38 100 H72 L90 56 L112 144 L128 100 H162" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>',
  // leaf (agri/supply)
  '<path d="M100 34 C152 58 158 128 100 166 C42 128 48 58 100 34 Z" fill="none" stroke="#fff" stroke-width="12"/><path d="M100 60 V140" stroke="#fff" stroke-width="10" stroke-linecap="round"/>',
  // route nodes (logistics)
  '<circle cx="58" cy="142" r="15" fill="#fff"/><circle cx="100" cy="64" r="15" fill="#fff"/><circle cx="146" cy="130" r="15" fill="#fff"/><path d="M66 130 L92 78 M112 74 L138 118" stroke="#fff" stroke-width="10" stroke-linecap="round"/>',
  // graduation (edtech)
  '<path d="M100 50 L170 84 L100 118 L30 84 Z" fill="#fff" opacity="0.95"/><path d="M64 104 V134 C64 152 136 152 136 134 V104" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/>',
  // sun (solar)
  '<circle cx="100" cy="100" r="26" fill="#fff"/><g stroke="#fff" stroke-width="11" stroke-linecap="round"><path d="M100 38 V56 M100 144 V162 M38 100 H56 M144 100 H162 M57 57 L70 70 M130 130 L143 143 M143 57 L130 70 M70 130 L57 143"/></g>',
  // shield (insurance)
  '<path d="M100 32 L158 54 V104 C158 140 132 162 100 172 C68 162 42 140 42 104 V54 Z" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round"/><path d="M76 102 L94 120 L128 82" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>',
  // hex core (robotics)
  '<path d="M100 36 L154 68 V132 L100 164 L46 132 V68 Z" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round"/><circle cx="100" cy="100" r="22" fill="#fff"/>',
];

function logoFile(key, [c1, c2], glyphIdx) {
  const file = `${key}.svg`;
  fs.writeFileSync(path.join(UP, file),
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="200" height="200" rx="44" fill="url(#g)"/>${GLYPHS[glyphIdx % GLYPHS.length]}</svg>`);
  return `/uploads/${file}`;
}

function avatarFile(key, initials, [c1, c2]) {
  const file = `${key}.svg`;
  fs.writeFileSync(path.join(UP, file),
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="200" height="200" rx="100" fill="url(#g)"/><text x="100" y="102" font-family="Inter,Arial,sans-serif" font-size="70" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`);
  return `/uploads/${file}`;
}

// Wide cover banners: layered gradient + soft shapes (LinkedIn-style hero)
function coverFile(key, [c1, c2]) {
  const file = `${key}.svg`;
  fs.writeFileSync(path.join(UP, file),
    `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="350" viewBox="0 0 1400 350"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient><radialGradient id="r1" cx="0.2" cy="0.1" r="0.6"><stop offset="0%" stop-color="#fff" stop-opacity="0.14"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="1400" height="350" fill="url(#g)"/><rect width="1400" height="350" fill="url(#r1)"/><circle cx="1180" cy="60" r="190" fill="#fff" opacity="0.05"/><circle cx="1320" cy="270" r="130" fill="#fff" opacity="0.07"/><circle cx="180" cy="300" r="160" fill="#000" opacity="0.10"/><path d="M0 290 Q 350 220 700 270 T 1400 250 V350 H0 Z" fill="#000" opacity="0.16"/></svg>`);
  return `/uploads/${file}`;
}

const VIDEO = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const VIDEO2 = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4';

const insUser = db.prepare(`INSERT INTO users (role,name,email,password_hash,city,headline,bio,photo,linkedin,education,experience,badges,verified,onboarded)
  VALUES (@role,@name,@email,'${PASS}',@city,@headline,@bio,@photo,@linkedin,@education,@experience,@badges,@verified,1)`);

// ---------- Admin ----------
db.prepare(`INSERT INTO users (role,name,email,password_hash,headline,verified,onboarded) VALUES ('admin','Platform Admin','admin@fundamental.app','${PASS}','Fundamental Operations',1,1)`).run();

// ---------- Founders (India + global mix) ----------
const founders = [
  { name: 'Ananya Sharma', city: 'Mumbai', headline: 'Founder & CEO, PayLane', bio: 'Building unified payment infrastructure for Indian SMEs — UPI, cards and credit on one rail. Previously led product at a top payments unicorn.', education: 'B.Tech Computer Science, IIT Bombay', experience: 'Product Lead at Razorpay (2019–2022); Software Engineer at Flipkart', badges: ['High Growth Founder'], verified: 1 },
  { name: 'Rohan Mehta', city: 'Bengaluru', headline: 'Co-founder, MedGrid', bio: 'Digitising clinical workflows across Indian and Southeast Asian hospitals. Second-time founder; first company acquired in 2021.', education: 'MBBS, AIIMS Delhi', experience: 'Founder of ClinicOS (acquired); Physician, Apollo Hospitals', badges: ['Repeat Founder', 'Exited Founder'], verified: 1 },
  { name: 'Priya Nair', city: 'Delhi NCR', headline: 'Founder, FarmLink', bio: 'B2B marketplace connecting farm producers with urban retailers across India.', education: 'MBA, INSEAD', experience: 'Strategy at McKinsey & Company; Operations at BigBasket', badges: [], verified: 1 },
  { name: 'James Whitfield', city: 'London', headline: 'CEO, LogiChain', bio: 'AI-driven freight orchestration for Europe–Asia trade lanes.', education: 'MSc Logistics, MIT', experience: 'VP Operations at Maersk; Bain & Company', badges: ['High Growth Founder'], verified: 0 },
  { name: 'Meera Iyer', city: 'Chennai', headline: 'Founder, LearnSprint', bio: 'Personalised K-12 learning in English, Hindi and Tamil — serving 400k students.', education: 'BA Education, University of Madras', experience: 'Teach For India; EdTech consultant, UNICEF', badges: [], verified: 1 },
  { name: 'Arjun Patel', city: 'Ahmedabad', headline: 'Co-founder, SuryaGrid', bio: 'Marketplace and financing layer for commercial rooftop solar across India.', education: 'B.E. Electrical, BITS Pilani', experience: 'Project Engineer at Tata Power Solar', badges: [], verified: 0 },
  { name: 'Emily Zhang', city: 'Singapore', headline: 'Founder, Insurly', bio: 'Embedded insurance APIs powering digital platforms across APAC.', education: 'BSc Actuarial Science, LSE', experience: 'Actuary at AIA; Product at Grab Financial', badges: ['Repeat Founder'], verified: 1 },
  { name: 'Kabir Singh', city: 'Pune', headline: 'CEO, MechWorks Robotics', bio: 'Warehouse automation robots designed and manufactured in India.', education: 'PhD Robotics, ETH Zürich', experience: 'Research Scientist at ISRO; Robotics Lead at GreyOrange', badges: [], verified: 1 },
];
const AV_GRADS = [['#1d4ed8', '#38bdf8'], ['#0f766e', '#34d399'], ['#7c3aed', '#a78bfa'], ['#b45309', '#fbbf24'], ['#be123c', '#fb7185'], ['#15803d', '#4ade80'], ['#0e7490', '#22d3ee'], ['#4338ca', '#818cf8']];
const founderIds = founders.map((f, i) => insUser.run({
  ...f,
  role: 'founder', email: `founder${i + 1}@demo.app`,
  photo: avatarFile(`u-f${i + 1}`, f.name.split(' ').map(w => w[0]).join(''), AV_GRADS[i]),
  linkedin: `https://linkedin.com/in/${f.name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
  badges: JSON.stringify(f.badges),
}).lastInsertRowid);

// ---------- Investors ----------
const investors = [
  { name: 'Vikram Malhotra', city: 'Mumbai', headline: 'Partner, Peak Bridge Ventures', fund: 'Peak Bridge Ventures', fund_size: '$150M', check: '$500K – $3M', stages: ['Seed', 'Series A'], sectors: ['Fintech', 'Logistics'], thesis: 'We back technical founders building the financial and supply-chain rails of digital India — UPI-native, mobile-first, built for a billion users.', verified: 1 },
  { name: 'Sophie Laurent', city: 'London', headline: 'Principal, Meridian Capital', fund: 'Meridian Capital', fund_size: '$400M', check: '$2M – $10M', stages: ['Series A', 'Series B'], sectors: ['Healthtech', 'Insurtech'], thesis: 'Healthcare and insurance across emerging markets are a decade behind digital standards. We fund the teams closing that gap, from London to Bengaluru.', verified: 1 },
  { name: 'Aditya Rao', city: 'Bengaluru', headline: 'Angel Investor & Operator', fund: 'Rao Family Office', fund_size: '$25M', check: '$50K – $500K', stages: ['Pre-Seed', 'Seed'], sectors: ['SaaS', 'Edtech', 'Climate'], thesis: 'First cheques into mission-driven founders, with hands-on operating support from incorporation to Series A.', verified: 1 },
  { name: 'Chen Wei', city: 'Singapore', headline: 'Investment Director, Horizon Pacific', fund: 'Horizon Pacific', fund_size: '$220M', check: '$1M – $5M', stages: ['Seed', 'Series A'], sectors: ['Climate', 'Logistics', 'Deeptech'], thesis: 'Industrial transformation of Asia: energy transition, automation and the infrastructure beneath it.', verified: 0 },
  { name: 'Nisha Kapoor', city: 'Delhi NCR', headline: 'GP, Saffron Fund', fund: 'Saffron Fund', fund_size: '$80M', check: '$250K – $1.5M', stages: ['Seed'], sectors: ['Fintech', 'SaaS', 'Edtech'], thesis: 'Seed-stage conviction investing in founders solving everyday problems for the next 500 million Indian consumers.', verified: 1 },
];
const insIP = db.prepare(`INSERT INTO investor_profiles (user_id,fund_name,fund_size,check_size,stage_focus,sector_focus,thesis,portfolio) VALUES (?,?,?,?,?,?,?,?)`);
const IV_GRADS = [['#1e293b', '#475569'], ['#3f3f46', '#71717a'], ['#312e81', '#6366f1'], ['#134e4a', '#2dd4bf'], ['#431407', '#fb923c']];
const investorIds = investors.map((v, i) => {
  const id = insUser.run({
    role: 'investor', email: `investor${i + 1}@demo.app`, city: v.city, name: v.name, headline: v.headline,
    bio: v.thesis, photo: avatarFile(`u-i${i + 1}`, v.name.split(' ').map(w => w[0]).join(''), IV_GRADS[i]),
    linkedin: `https://linkedin.com/in/${v.name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
    education: '', experience: '', badges: '[]', verified: v.verified,
  }).lastInsertRowid;
  insIP.run(id, v.fund, v.fund_size, v.check, JSON.stringify(v.stages), JSON.stringify(v.sectors), v.thesis, '[]');
  return id;
});

// ---------- Startups ----------
const rev = (start, g) => JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ month: ['Q1 24', 'Q2 24', 'Q3 24', 'Q4 24', 'Q1 25', 'Q2 25', 'Q3 25', 'Q4 25'][i], revenue: Math.round(start * Math.pow(1 + g, i)) })));
const chapters = JSON.stringify([
  { t: 0, label: 'Introduction & Team' }, { t: 90, label: 'The Problem' }, { t: 210, label: 'Our Solution' },
  { t: 330, label: 'Product Demo' }, { t: 450, label: 'Market & Business Model' }, { t: 570, label: 'Traction & Metrics' }, { t: 660, label: 'The Round & Use of Funds' },
]);
const LOGO_GRADS = [['#1e3a8a', '#38bdf8'], ['#0e7490', '#34d399'], ['#166534', '#a3e635'], ['#312e81', '#818cf8'], ['#6d28d9', '#c084fc'], ['#b45309', '#fbbf24'], ['#0c4a6e', '#22d3ee'], ['#334155', '#94a3b8']];
const startups = [
  { f: 0, name: 'PayLane', sector: 'Fintech', subsector: 'Payments', stage: 'Series A', city: 'Mumbai', year: 2022, status: 'Actively Raising', amount: '$8M', one: 'Unified payment rails for Indian SMEs — UPI, cards and credit in one API.', arr: 3200000, mrr: 290000, growth: 18, gm: 71, burn: 180000, runway: 19, cac: 420, ltv: 6800, video: VIDEO, verified: 1, g: 0.22,
    problem: 'Indian SMEs juggle 4–6 payment providers with no unified reconciliation, losing 3% of revenue to settlement errors and gateway fees.', solution: 'A single API and dashboard that aggregates every major rail (UPI, cards, netbanking, BNPL) with automated reconciliation and instant settlement.', model: 'Blended take rate of 0.45% on processed volume plus SaaS tiers for reconciliation tooling.', market: '$110B in annual SME digital payment volume in India, growing 30% YoY.', moat: 'Direct integrations with 14 banks and all major UPI apps that took 30 months to certify — a regulatory moat competitors must rebuild from scratch.', round: 'Raising $8M Series A at $40M pre. $3.5M committed by existing investors. Closing target: Q3 2026.',
    uof: [['Engineering & Product', 45], ['Licensing & Compliance', 20], ['Go-to-market', 25], ['Working Capital', 10]], timeline: '18-month deployment: tier-1 city expansion in months 1–6, tier-2/3 rollout months 6–12, SEA entry months 12–18.', objectives: 'Reach $10M ARR, secure PA license, and become the default payment layer for Indian SME platforms.' },
  { f: 1, name: 'MedGrid', sector: 'Healthtech', subsector: 'Clinical SaaS', stage: 'Series A', city: 'Bengaluru', year: 2021, status: 'Actively Raising', amount: '$12M', one: 'The operating system for hospital workflows — 60 hospitals live across India & SEA.', arr: 5100000, mrr: 460000, growth: 11, gm: 78, burn: 260000, runway: 22, cac: 9000, ltv: 210000, video: VIDEO2, verified: 1, g: 0.15,
    problem: 'Hospitals across India and Southeast Asia run on fragmented legacy systems; clinicians spend 40% of their day on administrative coordination.', solution: 'A modular clinical workflow layer that sits on top of any EMR, digitising rounds, handoffs, and discharge planning.', model: 'Per-bed annual SaaS licensing with implementation services.', market: '70,000+ hospitals across India and SEA; $3.4B addressable software spend.', moat: 'Deployed clinical content library built with 500+ physicians; switching costs compound with each integrated department.', round: '$12M Series A in progress; funds 24 months of India + SEA expansion.',
    uof: [['Product & Clinical Content', 40], ['Hospital Onboarding Teams', 30], ['Regulatory & Security', 15], ['G&A', 15]], timeline: 'Months 1–9: 40 new hospital deployments in India. Months 9–24: Indonesia and Vietnam entry.', objectives: 'Become the standard clinical workflow layer in 250 hospitals by 2028.' },
  { f: 2, name: 'FarmLink', sector: 'Marketplace', subsector: 'B2B Food Supply', stage: 'Seed', city: 'Delhi NCR', year: 2023, status: 'Actively Raising', amount: '$3M', one: 'Direct-from-farm supply for 4,800 urban retailers across North India.', arr: 1100000, mrr: 105000, growth: 26, gm: 24, burn: 95000, runway: 14, cac: 130, ltv: 2400, video: VIDEO, verified: 1, g: 0.3,
    problem: 'Independent kirana stores and grocers pay 18–25% middleman margins and face chronic stockouts on fresh produce.', solution: 'A managed marketplace with next-day delivery from 600 verified farm producers, with embedded credit at checkout.', model: '9% marketplace take rate plus financing margin on embedded credit.', market: '$620B Indian food and grocery market, <3% digitised at the wholesale layer.', moat: 'Proprietary producer quality-grading data and route density in Delhi NCR that cuts delivery cost 40% below competitors.', round: '$3M Seed to extend the model to Jaipur and Lucknow.',
    uof: [['Logistics Expansion', 40], ['Embedded Credit Book', 30], ['Engineering', 20], ['G&A', 10]], timeline: 'Jaipur launch in month 4, Lucknow in month 9, credit product GA in month 6.', objectives: 'Triple GMV in 18 months while holding contribution margin positive in Delhi NCR.' },
  { f: 3, name: 'LogiChain', sector: 'Logistics', subsector: 'Freight Tech', stage: 'Seed', city: 'London', year: 2023, status: 'Actively Raising', amount: '$4M', one: 'AI freight orchestration for Europe–Asia trade lanes — 92% on-time rate.', arr: 800000, mrr: 75000, growth: 21, gm: 52, burn: 110000, runway: 11, cac: 1800, ltv: 31000, video: VIDEO2, verified: 0, g: 0.25,
    problem: 'Cross-continental freight forwarding still runs on emails and spreadsheets; 30% of container capacity moves inefficiently.', solution: 'An AI dispatch engine matching port flows to carrier capacity in real time, with a shipper dashboard and carrier app.', model: 'Per-shipment orchestration fee plus SaaS for enterprise shippers.', market: '$180B Europe–Asia freight forwarding market.', moat: 'Two years of lane-specific flow data powering ETAs competitors cannot match.', round: '$4M Seed; anchor LOI from a FTSE-100 retailer.',
    uof: [['AI & Engineering', 45], ['Carrier Network Growth', 30], ['Enterprise Sales', 15], ['G&A', 10]], timeline: 'Rotterdam–Mumbai lane live by month 6; 2,000 active carriers by month 12.', objectives: 'Reach $2.5M ARR and 95% on-time rate across three trade lanes.' },
  { f: 4, name: 'LearnSprint', sector: 'Edtech', subsector: 'K-12 Learning', stage: 'Series A', city: 'Chennai', year: 2021, status: 'Not Raising', amount: '', one: 'Personalised K-12 learning in 3 languages for 400,000 Indian students.', arr: 2400000, mrr: 215000, growth: 9, gm: 68, burn: 120000, runway: 26, cac: 18, ltv: 240, video: VIDEO, verified: 1, g: 0.12,
    problem: 'Quality tutoring in regional languages is scarce and expensive; classroom sizes across India average 40+ students.', solution: 'Adaptive curriculum-aligned learning paths (CBSE, ICSE, state boards) with live tutor marketplaces, priced for mass-market families.', model: 'Consumer subscriptions plus B2B school licensing.', market: '250M K-12 students in India; $12B private tutoring spend.', moat: 'Largest multilingual adaptive question bank (2.1M items) tuned on 900M student responses.', round: 'Not currently raising; next round planned for late 2026.',
    uof: [['Content & Curriculum', 40], ['Product', 35], ['Growth', 25]], timeline: '—', objectives: 'Expand to Hindi-belt state boards in 2026; reach 1M active students.' },
  { f: 5, name: 'SuryaGrid', sector: 'Climate', subsector: 'Solar Energy', stage: 'Pre-Seed', city: 'Ahmedabad', year: 2024, status: 'Actively Raising', amount: '$1.2M', one: 'Marketplace + financing layer for commercial rooftop solar in India.', arr: 150000, mrr: 18000, growth: 32, gm: 41, burn: 35000, runway: 9, cac: 950, ltv: 14000, video: VIDEO2, verified: 0, g: 0.35,
    problem: 'Indian businesses want solar but face opaque pricing, unvetted installers, and no financing options.', solution: 'A vetted installer marketplace with instant satellite-based quoting and lease-to-own financing.', model: 'Installer commission (8%) plus financing origination fees.', market: 'India targets 500GW renewable capacity by 2030; commercial rooftop is a $14B greenfield.', moat: 'Proprietary irradiance + tariff quoting engine producing bankable estimates in 60 seconds.', round: '$1.2M Pre-Seed for licensing, team and first 200 installations.',
    uof: [['Engineering', 35], ['Installer Network', 25], ['Financing Partnerships', 25], ['G&A', 15]], timeline: 'First 200 funded installations within 12 months.', objectives: 'Prove unit economics on 200 systems and secure debt facility for financing book.' },
  { f: 6, name: 'Insurly', sector: 'Insurtech', subsector: 'Embedded Insurance', stage: 'Seed', city: 'Singapore', year: 2022, status: 'Round Closing', amount: '$5M', one: 'Embedded insurance APIs powering 45+ digital platforms across APAC.', arr: 1900000, mrr: 170000, growth: 14, gm: 63, burn: 140000, runway: 16, cac: 5200, ltv: 96000, video: VIDEO, verified: 1, g: 0.18,
    problem: 'Digital platforms across APAC want to offer insurance at point of sale but integrations with insurers take 12+ months.', solution: 'One API connecting platforms to licensed insurers with instant policy issuance and claims handling.', model: 'Commission share on gross written premium.', market: '$320B APAC insurance market with <1% embedded penetration.', moat: 'Regulatory approvals in Singapore, India and Indonesia plus revenue-share contracts with 8 insurers.', round: '$5M Seed, oversubscribed — final allocations closing.',
    uof: [['Engineering', 40], ['Insurer Integrations', 25], ['India Expansion', 20], ['G&A', 15]], timeline: 'IRDAI sandbox entry in month 3; 4 new insurer partners by month 9.', objectives: 'Cross $5M ARR and win the Indian embedded insurance market.' },
  { f: 7, name: 'MechWorks Robotics', sector: 'Deeptech', subsector: 'Warehouse Automation', stage: 'Seed', city: 'Pune', year: 2023, status: 'Actively Raising', amount: '$6M', one: 'Warehouse automation robots designed and manufactured in India.', arr: 600000, mrr: 0, growth: 0, gm: 38, burn: 200000, runway: 10, cac: 0, ltv: 0, video: VIDEO2, verified: 1, g: 0.4,
    problem: 'E-commerce operators across India face 35% annual warehouse labour turnover and same-day delivery SLAs.', solution: 'Autonomous mobile robots with multilingual WMS integration, sold as Robotics-as-a-Service.', model: 'RaaS: monthly fee per robot with hardware financed on our balance sheet.', market: '$4.2B Indian warehouse automation spend by 2028, accelerated by quick-commerce.', moat: 'Only India-manufactured AMR (70% local content) — qualifies for PLI incentives and 6-week delivery vs 9 months for imports.', round: '$6M Seed: 70% hardware fleet, 30% software team.',
    uof: [['Robot Fleet Manufacturing', 50], ['Software & Autonomy', 25], ['Pilots & Deployment', 15], ['G&A', 10]], timeline: 'Fleet of 150 robots deployed across 4 anchor customers within 15 months.', objectives: 'Convert 4 paid pilots to multi-year RaaS contracts; reach ₹100Cr ARR run-rate.' },
];

const insStartup = db.prepare(`INSERT INTO startups (founder_id,name,logo,sector,subsector,stage,city,founded_year,raising_status,raising_amount,one_liner,problem,solution,business_model,market_size,competitive_advantage,round_details,arr,mrr,growth,gross_margin,burn,runway,cac,ltv,revenue_series,video_url,video_chapters,video_views,views,verified,use_of_funds,deployment_timeline,strategic_objectives)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const startupIds = startups.map((s, i) => insStartup.run(
  founderIds[s.f], s.name, logoFile(`s-${i + 1}`, LOGO_GRADS[i], i), s.sector, s.subsector, s.stage, s.city, s.year,
  s.status, s.amount, s.one, s.problem, s.solution, s.model, s.market, s.moat, s.round,
  s.arr, s.mrr, s.growth, s.gm, s.burn, s.runway, s.cac, s.ltv,
  rev(Math.max(s.mrr || s.arr / 12, 5000) * 0.4, s.g), s.video, chapters,
  120 + i * 47, 800 + i * 230, s.verified,
  JSON.stringify(s.uof.map(([label, pct]) => ({ label, pct }))), s.timeline, s.objectives
).lastInsertRowid);

// Covers + verification tiers (1 Verified · 2 Enhanced · 3 Institution)
const setUserCover = db.prepare('UPDATE users SET cover=?, verified=? WHERE id=?');
founderIds.forEach((id, i) => setUserCover.run(coverFile(`cov-f${i + 1}`, AV_GRADS[i]), [2, 2, 1, 0, 1, 0, 2, 1][i], id));
investorIds.forEach((id, i) => setUserCover.run(coverFile(`cov-i${i + 1}`, IV_GRADS[i]), [2, 3, 1, 0, 2][i], id));
const setStartupCover = db.prepare('UPDATE startups SET cover=?, verified=? WHERE id=?');
startupIds.forEach((id, i) => setStartupCover.run(coverFile(`cov-s${i + 1}`, LOGO_GRADS[i]), [2, 3, 1, 0, 1, 0, 2, 1][i], id));

// Communities — topics, cities, roles
const insCom = db.prepare('INSERT INTO communities (slug,name,kind,description) VALUES (?,?,?,?)');
const COMMUNITIES = [
  ...[['ai', 'AI', 'Building and applying AI — models, agents, infrastructure and real deployments.'],
    ['saas', 'SaaS', 'Recurring revenue craft: pricing, retention, GTM and scaling playbooks.'],
    ['fintech', 'Fintech', 'Payments, lending, infrastructure and regulation across markets.'],
    ['healthtech', 'Healthtech', 'Clinical software, diagnostics and care delivery.'],
    ['climate', 'Climate', 'Energy transition, sustainability and industrial decarbonisation.'],
    ['consumer', 'Consumer', 'Brands, marketplaces and consumer behaviour.']].map(([s, n, d]) => [s, n, 'topic', d]),
  ...[['mumbai', 'Mumbai'], ['bengaluru', 'Bengaluru'], ['delhi', 'Delhi'], ['singapore', 'Singapore'],
    ['dubai', 'Dubai'], ['london', 'London'], ['new-york', 'New York']].map(([s, n]) => [s, n, 'city', `The ${n} startup ecosystem — founders, investors and operators on the ground.`]),
  ...[['founders', 'Founders', 'Peer support and hard-won lessons from people building companies.'],
    ['angels', 'Angels', 'First-cheque investing: sourcing, judgment and portfolio construction.'],
    ['vcs', 'VCs', 'Institutional venture: theses, diligence and fund craft.'],
    ['operators', 'Operators', 'The people who scale companies: product, growth, ops and finance.']].map(([s, n, d]) => [s, n, 'role', d]),
];
const comIds = {};
COMMUNITIES.forEach(([slug, name, kind, desc]) => { comIds[slug] = insCom.run(slug, name, kind, desc).lastInsertRowid; });

const insMem = db.prepare('INSERT INTO community_members (community_id,user_id) VALUES (?,?)');
const joinAll = (uid, slugs) => slugs.forEach(s => insMem.run(comIds[s], uid));
joinAll(founderIds[0], ['fintech', 'saas', 'mumbai', 'founders']);
joinAll(founderIds[1], ['healthtech', 'bengaluru', 'founders']);
joinAll(founderIds[2], ['consumer', 'delhi', 'founders']);
joinAll(founderIds[4], ['ai', 'saas', 'founders']);
joinAll(founderIds[6], ['fintech', 'singapore', 'founders']);
joinAll(founderIds[7], ['ai', 'founders']);
joinAll(investorIds[0], ['fintech', 'mumbai', 'vcs']);
joinAll(investorIds[1], ['healthtech', 'london', 'vcs']);
joinAll(investorIds[2], ['saas', 'ai', 'bengaluru', 'angels']);
joinAll(investorIds[3], ['climate', 'singapore', 'vcs']);
joinAll(investorIds[4], ['fintech', 'delhi', 'vcs', 'angels']);

const insCPost = db.prepare('INSERT INTO community_posts (community_id,user_id,title,body) VALUES (?,?,?,?)');
const insCReply = db.prepare('INSERT INTO community_replies (post_id,user_id,body) VALUES (?,?,?)');
const cp1 = insCPost.run(comIds['fintech'], investorIds[0], 'What does the UPI credit line rollout mean for SME lenders?',
  'RBI’s credit-line-on-UPI framework changes the distribution equation entirely. The moat shifts from origination to underwriting data. Founders in this space — how are you thinking about data partnerships vs building your own flow-based models?').lastInsertRowid;
insCReply.run(cp1, founderIds[0], 'We see it as the biggest unlock since UPI itself. Distribution gets commoditised; the winners will own reconciliation and repayment behaviour data. That’s where we’re investing our roadmap.');
insCReply.run(cp1, investorIds[4], 'Agree on underwriting data. The uncomfortable question is take-rate compression — pricing power will sit with whoever owns the merchant relationship.');
const cp2 = insCPost.run(comIds['saas'], investorIds[2], 'Indian SaaS pricing: stop discounting for logos',
  'Reviewed 40+ seed SaaS decks this quarter. The most common self-inflicted wound: 60–80% discounts for “strategic logos” that never convert to reference customers. Charge full price to 5 customers who feel the pain daily. Their renewal is your best fundraising slide.').lastInsertRowid;
insCReply.run(cp2, founderIds[4], 'Painfully accurate. We cut our discount ceiling to 20% last year — churn dropped because the customers who stayed had real budget and real intent.');
const cp3 = insCPost.run(comIds['bengaluru'], founderIds[1], 'AMA: scaling clinical software across 60 hospitals — ask me anything',
  'We crossed 60 hospital deployments across India and SEA. Happy to share what worked (and what failed) on hospital sales cycles, clinical champions, NABH compliance, and pricing per bed. Ask away.').lastInsertRowid;
insCReply.run(cp3, investorIds[1], 'What was your median sales cycle at hospital #5 vs hospital #50? And which stakeholder actually signs?');
insCReply.run(cp3, founderIds[1], '11 months at #5, 4 months at #50 — references compound. The CMO champions, but the CFO signs. Price per bed per year, never per user.');
const cp4 = insCPost.run(comIds['founders'], founderIds[6], 'Resource: our seed data room checklist (what investors actually opened)',
  'After closing our round I pulled the data-room analytics. Most-opened docs: financial model (every investor), cohort retention (80%), cap table (70%). Least-opened: 40-page market study (12%). Build the docs investors actually read. Full checklist in the thread.').lastInsertRowid;
insCReply.run(cp4, founderIds[2], 'This matches our experience exactly. The IM mattered less than a clean, honest model with assumptions exposed.');
insCPost.run(comIds['ai'], investorIds[2], 'Emerging theme: applied AI in Indian logistics is underpriced',
  'Everyone is funding horizontal copilots. Meanwhile route optimisation, warehouse autonomy and freight pricing models are quietly compounding with real revenue and zero hype premium. Watching this space closely — founders here, say hello.');

// Collateral
const docTypes = [['Investor Deck', 'Deck', 'Public'], ['Information Memorandum', 'IM', 'Request Access'], ['Financial Model (3-yr)', 'Financial Model', 'Request Access'], ['Industry Overview', 'Industry Overview', 'Public'], ['Product Demo Recording', 'Product Demo', 'Connected Only'], ['Cap Table', 'Cap Table', 'Request Access']];
const insCol = db.prepare('INSERT INTO collateral (startup_id,title,type,access_level,file_url,downloads) VALUES (?,?,?,?,?,?)');
startupIds.forEach((sid, i) => {
  docTypes.slice(0, 3 + (i % 4)).forEach(([t, ty, a], j) => insCol.run(sid, t, ty, a, '', 5 + ((i * 7 + j * 3) % 40)));
});

// Activities
const acts = [
  ['Round Opened', 'opened its round'], ['Milestone Achieved', 'crossed a major revenue milestone'],
  ['Hiring Announcement', 'is hiring senior engineers'], ['Collateral Uploaded', 'uploaded a new investor deck'],
];
startupIds.forEach((sid, i) => {
  acts.slice(0, 2 + (i % 3)).forEach(([t, txt]) => addActivity(sid, t, `${startups[i].name} ${txt}`));
});

// Connections, upvotes, watchlist, notes
const insConn = db.prepare("INSERT INTO connections (requester_id,recipient_id,status) VALUES (?,?,?)");
insConn.run(investorIds[0], founderIds[0], 'accepted');
insConn.run(investorIds[0], founderIds[3], 'accepted');
insConn.run(investorIds[1], founderIds[1], 'accepted');
insConn.run(investorIds[2], founderIds[4], 'accepted');
insConn.run(investorIds[2], founderIds[5], 'pending');
insConn.run(investorIds[4], founderIds[0], 'pending');
insConn.run(founderIds[2], investorIds[3], 'accepted');
insConn.run(founderIds[6], investorIds[1], 'accepted');
insConn.run(founderIds[0], founderIds[3], 'accepted');   // Ananya ↔ James (warm intro path demo)
insConn.run(founderIds[0], founderIds[1], 'accepted');   // Ananya ↔ Rohan

const insUp = db.prepare('INSERT INTO upvotes (user_id,startup_id) VALUES (?,?)');
investorIds.forEach((iid, i) => startupIds.filter((_, j) => (i + j) % 2 === 0).forEach(sid => insUp.run(iid, sid)));

const insWatch = db.prepare("INSERT INTO watchlist (user_id,startup_id,status) VALUES (?,?,?)");
insWatch.run(investorIds[0], startupIds[0], 'Due Diligence');
insWatch.run(investorIds[0], startupIds[3], 'Tracking');
insWatch.run(investorIds[1], startupIds[1], 'Intro Call Done');
insWatch.run(investorIds[1], startupIds[6], 'Tracking');
insWatch.run(investorIds[2], startupIds[4], 'Tracking');

db.prepare('INSERT INTO notes (investor_id,startup_id,text) VALUES (?,?,?)')
  .run(investorIds[0], startupIds[0], 'Strong regulatory moat. Validate bank integration claims in DD. Intro to portfolio CFO for reference check.');

// Conversations
const insConvo = db.prepare('INSERT INTO conversations (a_id,b_id,deal_stage) VALUES (?,?,?)');
const insMsg = db.prepare('INSERT INTO messages (conversation_id,sender_id,text,ref_startup_id) VALUES (?,?,?,?)');
const c1 = insConvo.run(Math.min(investorIds[0], founderIds[0]), Math.max(investorIds[0], founderIds[0]), 'Due Diligence').lastInsertRowid;
insMsg.run(c1, investorIds[0], 'Ananya — watched your full 12-minute pitch. The UPI integration depth is impressive. Could you share the IM and the latest cohort data?', startupIds[0]);
insMsg.run(c1, founderIds[0], 'Thank you Vikram. Just granted you access to the IM in the data room. Cohort data is inside section 4. Happy to walk through it live this week.', null);
insMsg.run(c1, investorIds[0], 'Received. Let’s do Thursday 2pm — I’ll send an invite. Moving this to due diligence on our side.', null);
const c2 = insConvo.run(Math.min(investorIds[1], founderIds[1]), Math.max(investorIds[1], founderIds[1]), 'Intro').lastInsertRowid;
insMsg.run(c2, investorIds[1], 'Rohan, MedGrid keeps coming up in our hospital network. Open to an intro call next week?', startupIds[1]);

// Social posts
const insPost = db.prepare('INSERT INTO posts (user_id,type,text,startup_id) VALUES (?,?,?,?)');
const p1 = insPost.run(founderIds[0], 'Fundraising Announcement', 'PayLane is opening its $8M Series A. We processed $710M in SME volume last year at 71% gross margin, with 14 bank integrations live. The full 12-minute pitch and data room are on our profile.', startupIds[0]).lastInsertRowid;
const p2 = insPost.run(founderIds[1], 'Milestone', 'MedGrid is now live in 60 hospitals across India and Southeast Asia. 14,000 clinicians use the platform daily, and median discharge time in partner hospitals has dropped 22%.', startupIds[1]).lastInsertRowid;
insPost.run(investorIds[0], 'Investor Insight', 'After reviewing 80+ Indian fintech decks this quarter: the winners are no longer payments aggregators — they are reconciliation and treasury infrastructure. The back office is the new frontier.', null);
insPost.run(founderIds[7], 'Hiring', 'MechWorks Robotics is hiring: Senior Autonomy Engineer (Pune, on-site) and Embedded Systems Lead. Help us build world-class warehouse robots, made in India.', startupIds[7]);
insPost.run(investorIds[2], 'Investment Made', 'Proud to lead the pre-seed in two Indian climate companies this month. The energy transition here is not a thesis — it is a procurement schedule. Founders building in solar O&M, DM me.', null);
insPost.run(founderIds[6], 'Round Closed', 'Insurly’s $5M seed round is closed — oversubscribed. Grateful to our investors and the 45 platform partners who trusted us early. India, we are coming.', startupIds[6]);
db.prepare('INSERT INTO post_likes (user_id,post_id) VALUES (?,?)').run(investorIds[1], p1);
db.prepare('INSERT INTO post_likes (user_id,post_id) VALUES (?,?)').run(investorIds[2], p1);
db.prepare('INSERT INTO post_likes (user_id,post_id) VALUES (?,?)').run(founderIds[2], p2);
db.prepare('INSERT INTO post_comments (post_id,user_id,text) VALUES (?,?,?)').run(p1, investorIds[4], 'Impressive margins for payments. Requesting data room access now.');

// Founder updates
const insUpd = db.prepare('INSERT INTO founder_updates (startup_id,headline,body,arr,mrr,growth) VALUES (?,?,?,?,?,?)');
insUpd.run(startupIds[0], 'Q4: crossed $3.2M ARR, 14 bank integrations live', 'Processed volume grew 22% QoQ. Two enterprise platform deals signed (10k+ merchants each). Hiring a VP Engineering — intros welcome. Series A data room is fully refreshed.', 3200000, 290000, 18);
insUpd.run(startupIds[0], 'November: enterprise pilot converted', 'Our largest pilot converted to a 3-year contract. Net revenue retention now 131%. Burn flat. Next: UPI credit lines GA in January.', null, 270000, 16);
insUpd.run(startupIds[1], '60 hospitals live, SEA expansion started', 'First two Jakarta hospitals onboarded ahead of schedule. Median discharge time down 22% across the network. Raising continues — IM available in the data room.', 5100000, null, 11);
insUpd.run(startupIds[2], 'Jaipur launch ahead of plan', 'First 200 retailers onboarded in 3 weeks. Contribution margin positive in Delhi NCR for the second straight quarter. Embedded credit book at ₹4.1Cr with zero NPAs.', 1100000, null, 26);

// Access requests
db.prepare("INSERT INTO access_requests (collateral_id,investor_id,status) VALUES (2,?, 'approved')").run(investorIds[0]);
db.prepare("INSERT INTO access_requests (collateral_id,investor_id,status) VALUES (3,?, 'pending')").run(investorIds[4]);

// Profile view events (powers founder analytics)
const insView = db.prepare("INSERT INTO startup_views (user_id, startup_id, created_at) VALUES (?,?,datetime('now', ?))");
investorIds.forEach((iid, i) => {
  startupIds.filter((_, j) => (i + j) % 2 === 0).forEach((sid, k) => {
    insView.run(iid, sid, `-${(i + k) % 6} days`);
    if ((i + k) % 3 === 0) insView.run(iid, sid, `-${(i + k) % 4} days`);
  });
});

// Notifications
const notif = db.prepare('INSERT INTO notifications (user_id,type,text,link) VALUES (?,?,?,?)');
notif.run(founderIds[0], 'Upvote Received', 'Vikram Malhotra upvoted PayLane', `/startup/${startupIds[0]}`);
notif.run(founderIds[0], 'Collateral Request', 'Nisha Kapoor requested access to "Financial Model (3-yr)"', '/dashboard');
notif.run(founderIds[0], 'Connection Request', 'Nisha Kapoor wants to connect', '/network?tab=requests');
notif.run(investorIds[0], 'Access Approved', 'Access approved for "Information Memorandum" (PayLane)', `/startup/${startupIds[0]}`);
notif.run(investorIds[4], 'New Message', 'New activity on PayLane’s round', `/startup/${startupIds[0]}`);

// Demo accounts are pre-approved, consented, and email-verified so the seeded
// experience works on a fresh database (real signups remain gated).
try {
  db.exec("UPDATE users SET investor_approved=1 WHERE role='investor'");
  db.exec("UPDATE users SET email_verified=1, accepted_terms_at=datetime('now') WHERE accepted_terms_at IS NULL");
} catch { /* hardening columns may not exist on very old schemas */ }

console.log('Seeded Fundamental demo data.');
console.log('Logins (password: demo1234): founder1@demo.app … founder8@demo.app | investor1@demo.app … investor5@demo.app | admin@fundamental.app');
