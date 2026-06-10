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
const UP = path.join(__dirname, 'uploads');
fs.mkdirSync(UP, { recursive: true });

// Generate clean monogram SVG logos / avatars
function svgFile(name, text, bg, fg = '#fff') {
  const file = `${name}.svg`;
  fs.writeFileSync(path.join(UP, file),
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" rx="36" fill="${bg}"/><text x="100" y="100" font-family="Inter,Arial,sans-serif" font-size="76" font-weight="700" fill="${fg}" text-anchor="middle" dominant-baseline="central">${text}</text></svg>`);
  return `/uploads/${file}`;
}

const VIDEO = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const VIDEO2 = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4';

const insUser = db.prepare(`INSERT INTO users (role,name,email,password_hash,city,headline,bio,photo,linkedin,education,experience,badges,verified,onboarded)
  VALUES (@role,@name,@email,'${PASS}',@city,@headline,@bio,@photo,@linkedin,@education,@experience,@badges,@verified,1)`);

// ---------- Admin ----------
db.prepare(`INSERT INTO users (role,name,email,password_hash,headline,verified,onboarded) VALUES ('admin','Platform Admin','admin@fundamental.app','${PASS}','Fundamental Operations',1,1)`).run();

// ---------- Founders ----------
const founders = [
  { name: 'Aisha Al-Rashid', city: 'Riyadh', headline: 'Founder & CEO, PayLane', bio: 'Building payment infrastructure for MENA SMEs. Previously led product at a top regional fintech.', education: 'BSc Computer Science, KFUPM', experience: 'Product Lead at STC Pay (2019–2022); Software Engineer at Careem', badges: ['High Growth Founder'], verified: 1 },
  { name: 'Omar Haddad', city: 'Dubai', headline: 'Co-founder, MedGrid', bio: 'Digitising clinical workflows across GCC hospitals. Second-time founder; first company acquired in 2021.', education: 'MD, American University of Beirut', experience: 'Founder of ClinicOS (acquired); Resident physician, Cleveland Clinic Abu Dhabi', badges: ['Repeat Founder', 'Exited Founder'], verified: 1 },
  { name: 'Sara Mansour', city: 'Riyadh', headline: 'Founder, Mawred', bio: 'B2B marketplace connecting food producers with retailers across Saudi Arabia.', education: 'MBA, INSEAD', experience: 'Strategy at McKinsey & Company; Operations at Noon', badges: [], verified: 1 },
  { name: 'Khalid Nasser', city: 'Jeddah', headline: 'CEO, LogiChain', bio: 'AI-driven freight orchestration for the Red Sea corridor.', education: 'MSc Logistics, MIT', experience: 'VP Operations at Aramex; Bain & Company', badges: ['High Growth Founder'], verified: 0 },
  { name: 'Lina Farouk', city: 'Cairo', headline: 'Founder, TutorNile', bio: 'Personalised K-12 learning in Arabic, serving 200k students.', education: 'BA Education, Cairo University', experience: 'Teach For Egypt; EdTech consultant, UNICEF', badges: [], verified: 1 },
  { name: 'Yousef Qadi', city: 'Riyadh', headline: 'Co-founder, SolarSouq', bio: 'Marketplace and financing layer for commercial rooftop solar in KSA.', education: 'BEng Electrical, KAUST', experience: 'Project Engineer at ACWA Power', badges: [], verified: 0 },
  { name: 'Mariam Zaki', city: 'Abu Dhabi', headline: 'Founder, Insurly', bio: 'Embedded insurance APIs for digital platforms in the Gulf.', education: 'BSc Actuarial Science, LSE', experience: 'Actuary at Daman; Product at GIG Gulf', badges: ['Repeat Founder'], verified: 1 },
  { name: 'Tariq Benali', city: 'Riyadh', headline: 'CEO, Qiwa Robotics', bio: 'Warehouse automation robots designed and assembled in Saudi Arabia.', education: 'PhD Robotics, ETH Zürich', experience: 'Research Scientist at KACST', badges: [], verified: 1 },
];
const founderIds = founders.map((f, i) => insUser.run({
  ...f,
  role: 'founder', email: `founder${i + 1}@demo.app`, photo: svgFile(`u-f${i + 1}`, f.name.split(' ').map(w => w[0]).join(''), ['#1d4ed8', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#15803d', '#0e7490', '#4338ca'][i]),
  linkedin: `https://linkedin.com/in/${f.name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
  badges: JSON.stringify(f.badges),
}).lastInsertRowid);

// ---------- Investors ----------
const investors = [
  { name: 'Faisal Al-Saud', city: 'Riyadh', headline: 'Partner, Tuwaiq Ventures', fund: 'Tuwaiq Ventures', fund_size: '$150M', check: '$500K – $3M', stages: ['Seed', 'Series A'], sectors: ['Fintech', 'Logistics'], thesis: 'We back technical founders building financial and supply-chain infrastructure for the Saudi economy under Vision 2030.', verified: 1 },
  { name: 'Noor Khalifa', city: 'Dubai', headline: 'Principal, Gulf Capital Partners', fund: 'Gulf Capital Partners', fund_size: '$400M', check: '$2M – $10M', stages: ['Series A', 'Series B'], sectors: ['Healthtech', 'Insurtech'], thesis: 'Healthcare and insurance in the GCC are a decade behind global digital standards. We fund the teams closing that gap.', verified: 1 },
  { name: 'Hassan Mirza', city: 'Riyadh', headline: 'Angel Investor & Operator', fund: 'Mirza Family Office', fund_size: '$25M', check: '$50K – $500K', stages: ['Pre-Seed', 'Seed'], sectors: ['SaaS', 'Edtech', 'Climate'], thesis: 'First cheques into mission-driven founders, with hands-on operating support from incorporation to Series A.', verified: 1 },
  { name: 'Dana Aziz', city: 'Manama', headline: 'Investment Director, Almoayyed Capital', fund: 'Almoayyed Capital', fund_size: '$220M', check: '$1M – $5M', stages: ['Seed', 'Series A'], sectors: ['Climate', 'Logistics', 'Deeptech'], thesis: 'Industrial transformation of the Gulf: energy transition, automation and the infrastructure beneath it.', verified: 0 },
  { name: 'Reem Othman', city: 'Riyadh', headline: 'GP, Sidra Fund', fund: 'Sidra Fund', fund_size: '$80M', check: '$250K – $1.5M', stages: ['Seed'], sectors: ['Fintech', 'SaaS', 'Edtech'], thesis: 'Seed-stage conviction investing in founders solving everyday problems for the next 100M Arabic-speaking consumers.', verified: 1 },
];
const insIP = db.prepare(`INSERT INTO investor_profiles (user_id,fund_name,fund_size,check_size,stage_focus,sector_focus,thesis,portfolio) VALUES (?,?,?,?,?,?,?,?)`);
const investorIds = investors.map((v, i) => {
  const id = insUser.run({
    role: 'investor', email: `investor${i + 1}@demo.app`, city: v.city, name: v.name, headline: v.headline,
    bio: v.thesis, photo: svgFile(`u-i${i + 1}`, v.name.split(' ').map(w => w[0]).join(''), ['#334155', '#52525b', '#44403c', '#374151', '#3f3f46'][i]),
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
const startups = [
  { f: 0, name: 'PayLane', sector: 'Fintech', subsector: 'Payments', stage: 'Series A', city: 'Riyadh', year: 2022, status: 'Actively Raising', amount: '$8M', one: 'Unified payment rails for MENA SMEs — accept, reconcile and settle in one API.', arr: 3200000, mrr: 290000, growth: 18, gm: 71, burn: 180000, runway: 19, cac: 420, ltv: 6800, video: VIDEO, verified: 1, g: 0.22,
    problem: 'SMEs in MENA juggle 4–6 payment providers with no unified reconciliation, losing 3% of revenue to settlement errors and FX spreads.', solution: 'A single API and dashboard that aggregates every major regional rail (mada, STC Pay, Apple Pay, bank transfer) with automated reconciliation.', model: 'Blended take rate of 0.45% on processed volume plus SaaS tiers for reconciliation tooling.', market: '$48B in annual SME payment volume across GCC, growing 24% YoY.', moat: 'Direct integrations with 11 regional banks that took 30 months to license — a regulatory moat competitors must rebuild from scratch.', round: 'Raising $8M Series A at $40M pre. $3.5M committed by existing investors. Closing target: Q3 2026.',
    uof: [['Engineering & Product', 45], ['Licensing & Compliance', 20], ['Go-to-market', 25], ['Working Capital', 10]], timeline: '18-month deployment: KSA expansion in months 1–6, UAE licensing months 6–12, Egypt entry months 12–18.', objectives: 'Reach $10M ARR, secure PSP license in UAE, and become the default payment layer for Saudi SME platforms.' },
  { f: 1, name: 'MedGrid', sector: 'Healthtech', subsector: 'Clinical SaaS', stage: 'Series A', city: 'Dubai', year: 2021, status: 'Actively Raising', amount: '$12M', one: 'The operating system for GCC hospital workflows — 40 hospitals live.', arr: 5100000, mrr: 460000, growth: 11, gm: 78, burn: 260000, runway: 22, cac: 9000, ltv: 210000, video: VIDEO2, verified: 1, g: 0.15,
    problem: 'GCC hospitals run on fragmented legacy systems; clinicians spend 40% of their day on administrative coordination.', solution: 'A modular clinical workflow layer that sits on top of any EMR, digitising rounds, handoffs, and discharge planning.', model: 'Per-bed annual SaaS licensing with implementation services.', market: '1,100 hospitals across the GCC; $2.1B addressable software spend.', moat: 'Deployed clinical content library built with 300+ physicians; switching costs compound with each integrated department.', round: '$12M Series A led by conversations in progress; funds 24 months of UAE + KSA expansion.',
    uof: [['Product & Clinical Content', 40], ['Hospital Onboarding Teams', 30], ['Regulatory & Security', 15], ['G&A', 15]], timeline: 'Months 1–9: 30 new hospital deployments in KSA. Months 9–24: national health cluster integrations.', objectives: 'Become the standard clinical workflow layer in 150 GCC hospitals by 2028.' },
  { f: 2, name: 'Mawred', sector: 'Marketplace', subsector: 'B2B Food Supply', stage: 'Seed', city: 'Riyadh', year: 2023, status: 'Actively Raising', amount: '$3M', one: 'Direct-from-producer food supply for 2,400 Saudi retailers.', arr: 1100000, mrr: 105000, growth: 26, gm: 24, burn: 95000, runway: 14, cac: 130, ltv: 2400, video: VIDEO, verified: 1, g: 0.3,
    problem: 'Independent grocers pay 18–25% middleman margins and face chronic stockouts on fresh produce.', solution: 'A managed marketplace with next-day delivery from 180 verified producers, with embedded credit at checkout.', model: '9% marketplace take rate plus financing margin on embedded credit.', market: '$11B annual wholesale food trade in KSA, <2% digitised.', moat: 'Proprietary producer quality-grading data and route density in Riyadh that cuts delivery cost 40% below competitors.', round: '$3M Seed to extend the model to Jeddah and Dammam.',
    uof: [['Logistics Expansion', 40], ['Embedded Credit Book', 30], ['Engineering', 20], ['G&A', 10]], timeline: 'Jeddah launch in month 4, Dammam in month 9, credit product GA in month 6.', objectives: 'Triple GMV in 18 months while holding contribution margin positive in Riyadh.' },
  { f: 3, name: 'LogiChain', sector: 'Logistics', subsector: 'Freight Tech', stage: 'Seed', city: 'Jeddah', year: 2023, status: 'Actively Raising', amount: '$4M', one: 'AI freight orchestration for the Red Sea corridor — 92% on-time rate.', arr: 800000, mrr: 75000, growth: 21, gm: 52, burn: 110000, runway: 11, cac: 1800, ltv: 31000, video: VIDEO2, verified: 0, g: 0.25,
    problem: 'Red Sea freight forwarding is run on phone calls and spreadsheets; 30% of truck capacity moves empty.', solution: 'An AI dispatch engine matching port flows to truck capacity in real time, with a shipper dashboard and carrier app.', model: 'Per-shipment orchestration fee plus SaaS for enterprise shippers.', market: '$9B Saudi road freight market, accelerated by NEOM and Vision 2030 port investments.', moat: 'Two years of corridor-specific flow data powering ETAs competitors cannot match.', round: '$4M Seed; anchor LOI from a top-3 Saudi shipper.',
    uof: [['AI & Engineering', 45], ['Carrier Network Growth', 30], ['Enterprise Sales', 15], ['G&A', 10]], timeline: 'Dammam corridor live by month 6; 1,000 active trucks by month 12.', objectives: 'Reach $2.5M ARR and 95% on-time rate across both corridors.' },
  { f: 4, name: 'TutorNile', sector: 'Edtech', subsector: 'K-12 Learning', stage: 'Series A', city: 'Cairo', year: 2021, status: 'Not Raising', amount: '', one: 'Personalised Arabic K-12 learning for 200,000 students.', arr: 2400000, mrr: 215000, growth: 9, gm: 68, burn: 120000, runway: 26, cac: 18, ltv: 240, video: VIDEO, verified: 1, g: 0.12,
    problem: 'Quality tutoring in Arabic is scarce and expensive; classroom sizes across Egypt average 45+ students.', solution: 'Adaptive curriculum-aligned learning paths with live tutor marketplaces, priced for mass-market families.', model: 'Consumer subscriptions plus B2B school licensing.', market: '23M K-12 students in Egypt; $4.5B private tutoring spend.', moat: 'Largest Arabic-language adaptive question bank (1.2M items) tuned on 400M student responses.', round: 'Not currently raising; next round planned for late 2026.',
    uof: [['Content & Curriculum', 40], ['Product', 35], ['Growth', 25]], timeline: '—', objectives: 'Expand to KSA curriculum in 2026; reach 500k active students.' },
  { f: 5, name: 'SolarSouq', sector: 'Climate', subsector: 'Solar Energy', stage: 'Pre-Seed', city: 'Riyadh', year: 2024, status: 'Actively Raising', amount: '$1.2M', one: 'Marketplace + financing layer for commercial rooftop solar in KSA.', arr: 150000, mrr: 18000, growth: 32, gm: 41, burn: 35000, runway: 9, cac: 950, ltv: 14000, video: VIDEO2, verified: 0, g: 0.35,
    problem: 'Saudi businesses want solar but face opaque pricing, unvetted installers, and no financing options.', solution: 'A vetted installer marketplace with instant satellite-based quoting and lease-to-own financing.', model: 'Installer commission (8%) plus financing origination fees.', market: 'KSA targets 50% renewable generation by 2030; commercial rooftop is a $6B greenfield.', moat: 'Proprietary irradiance + tariff quoting engine producing bankable estimates in 60 seconds.', round: '$1.2M Pre-Seed for licensing, team and first 100 installations.',
    uof: [['Engineering', 35], ['Installer Network', 25], ['Financing Partnerships', 25], ['G&A', 15]], timeline: 'First 100 funded installations within 12 months.', objectives: 'Prove unit economics on 100 systems and secure debt facility for financing book.' },
  { f: 6, name: 'Insurly', sector: 'Insurtech', subsector: 'Embedded Insurance', stage: 'Seed', city: 'Abu Dhabi', year: 2022, status: 'Round Closing', amount: '$5M', one: 'Embedded insurance APIs powering 30+ Gulf digital platforms.', arr: 1900000, mrr: 170000, growth: 14, gm: 63, burn: 140000, runway: 16, cac: 5200, ltv: 96000, video: VIDEO, verified: 1, g: 0.18,
    problem: 'Digital platforms in the Gulf want to offer insurance at point of sale but integrations with insurers take 12+ months.', solution: 'One API connecting platforms to licensed insurers with instant policy issuance and claims handling.', model: 'Commission share on gross written premium.', market: '$18B GCC insurance market with <1% embedded penetration.', moat: 'Regulatory approvals in UAE and Bahrain plus revenue-share contracts with 6 insurers.', round: '$5M Seed, oversubscribed — final allocations closing.',
    uof: [['Engineering', 40], ['Insurer Integrations', 25], ['KSA License', 20], ['G&A', 15]], timeline: 'KSA regulatory sandbox entry in month 3; 3 new insurer partners by month 9.', objectives: 'Cross $5M ARR and win the KSA embedded insurance license.' },
  { f: 7, name: 'Qiwa Robotics', sector: 'Deeptech', subsector: 'Warehouse Automation', stage: 'Seed', city: 'Riyadh', year: 2023, status: 'Actively Raising', amount: '$6M', one: 'Warehouse automation robots designed and built in Saudi Arabia.', arr: 600000, mrr: 0, growth: 0, gm: 38, burn: 200000, runway: 10, cac: 0, ltv: 0, video: VIDEO2, verified: 1, g: 0.4,
    problem: 'GCC logistics operators face 35% annual warehouse labour turnover and rising fulfilment SLAs.', solution: 'Autonomous mobile robots with Arabic-first WMS integration, sold as Robotics-as-a-Service.', model: 'RaaS: monthly fee per robot with hardware financed on our balance sheet.', market: '$1.8B GCC warehouse automation spend by 2028.', moat: 'Only regionally-manufactured AMR (60% local content) — qualifies for national industrial incentives and 8-week delivery vs 9 months for imports.', round: '$6M Seed: 70% hardware fleet, 30% software team.',
    uof: [['Robot Fleet Manufacturing', 50], ['Software & Autonomy', 25], ['Pilots & Deployment', 15], ['G&A', 10]], timeline: 'Fleet of 120 robots deployed across 3 anchor customers within 15 months.', objectives: 'Convert 3 paid pilots to multi-year RaaS contracts; reach SAR 12M ARR.' },
];

const insStartup = db.prepare(`INSERT INTO startups (founder_id,name,logo,sector,subsector,stage,city,founded_year,raising_status,raising_amount,one_liner,problem,solution,business_model,market_size,competitive_advantage,round_details,arr,mrr,growth,gross_margin,burn,runway,cac,ltv,revenue_series,video_url,video_chapters,video_views,views,verified,use_of_funds,deployment_timeline,strategic_objectives)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const colors = ['#2563eb', '#0d9488', '#9333ea', '#d97706', '#e11d48', '#16a34a', '#0891b2', '#6d28d9'];
const startupIds = startups.map((s, i) => insStartup.run(
  founderIds[s.f], s.name, svgFile(`s-${i + 1}`, s.name[0], colors[i]), s.sector, s.subsector, s.stage, s.city, s.year,
  s.status, s.amount, s.one, s.problem, s.solution, s.model, s.market, s.moat, s.round,
  s.arr, s.mrr, s.growth, s.gm, s.burn, s.runway, s.cac, s.ltv,
  rev(Math.max(s.mrr || s.arr / 12, 5000) * 0.4, s.g), s.video, chapters,
  120 + i * 47, 800 + i * 230, s.verified,
  JSON.stringify(s.uof.map(([label, pct]) => ({ label, pct }))), s.timeline, s.objectives
).lastInsertRowid);

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
insMsg.run(c1, investorIds[0], 'Aisha — watched your full 12-minute pitch. The bank integration depth is impressive. Could you share the IM and the latest cohort data?', startupIds[0]);
insMsg.run(c1, founderIds[0], 'Thank you Faisal. Just granted you access to the IM in the data room. Cohort data is inside section 4. Happy to walk through it live this week.', null);
insMsg.run(c1, investorIds[0], 'Received. Let’s do Thursday 2pm — I’ll send an invite. Moving this to due diligence on our side.', null);
const c2 = insConvo.run(Math.min(investorIds[1], founderIds[1]), Math.max(investorIds[1], founderIds[1]), 'Intro').lastInsertRowid;
insMsg.run(c2, investorIds[1], 'Omar, MedGrid keeps coming up in our hospital network. Open to an intro call next week?', startupIds[1]);

// Social posts
const insPost = db.prepare('INSERT INTO posts (user_id,type,text,startup_id) VALUES (?,?,?,?)');
const p1 = insPost.run(founderIds[0], 'Fundraising Announcement', 'PayLane is opening its $8M Series A. We processed $710M in SME volume last year at 71% gross margin, with 11 direct bank integrations live. The full 12-minute pitch and data room are on our profile.', startupIds[0]).lastInsertRowid;
const p2 = insPost.run(founderIds[1], 'Milestone', 'MedGrid is now live in 40 hospitals across the GCC. 9,200 clinicians use the platform daily, and median discharge time in partner hospitals has dropped 22%.', startupIds[1]).lastInsertRowid;
insPost.run(investorIds[0], 'Investor Insight', 'After reviewing 60+ Saudi fintech decks this quarter: the winners are no longer payments aggregators — they are reconciliation and treasury infrastructure. The back office is the new frontier.', null);
insPost.run(founderIds[7], 'Hiring', 'Qiwa Robotics is hiring: Senior Autonomy Engineer (Riyadh, on-site) and Embedded Systems Lead. Help us build the first warehouse robots manufactured in the Kingdom.', startupIds[7]);
insPost.run(investorIds[2], 'Investment Made', 'Proud to lead the pre-seed in two Saudi climate companies this month. The energy transition here is not a thesis — it is a procurement schedule. Founders building in solar O&M, DM me.', null);
insPost.run(founderIds[6], 'Round Closed', 'Insurly’s $5M seed round is closed — oversubscribed. Grateful to our investors and the 30 platform partners who trusted us early. KSA, we are coming.', startupIds[6]);
db.prepare('INSERT INTO post_likes (user_id,post_id) VALUES (?,?)').run(investorIds[1], p1);
db.prepare('INSERT INTO post_likes (user_id,post_id) VALUES (?,?)').run(investorIds[2], p1);
db.prepare('INSERT INTO post_likes (user_id,post_id) VALUES (?,?)').run(founderIds[2], p2);
db.prepare('INSERT INTO post_comments (post_id,user_id,text) VALUES (?,?,?)').run(p1, investorIds[4], 'Impressive margins for payments. Requesting data room access now.');

// Access requests
db.prepare("INSERT INTO access_requests (collateral_id,investor_id,status) VALUES (2,?, 'approved')").run(investorIds[0]);
db.prepare("INSERT INTO access_requests (collateral_id,investor_id,status) VALUES (3,?, 'pending')").run(investorIds[4]);

// Notifications
const notif = db.prepare('INSERT INTO notifications (user_id,type,text,link) VALUES (?,?,?,?)');
notif.run(founderIds[0], 'Upvote Received', 'Faisal Al-Saud upvoted PayLane', `/startup/${startupIds[0]}`);
notif.run(founderIds[0], 'Collateral Request', 'Reem Othman requested access to "Financial Model (3-yr)"', '/dashboard');
notif.run(founderIds[0], 'Connection Request', 'Reem Othman wants to connect', '/network?tab=requests');
notif.run(investorIds[0], 'Access Approved', 'Access approved for "Information Memorandum" (PayLane)', `/startup/${startupIds[0]}`);
notif.run(investorIds[4], 'New Message', 'New activity on PayLane’s round', `/startup/${startupIds[0]}`);

console.log('Seeded Fundamental demo data.');
console.log('Logins (password: demo1234): founder1@demo.app … founder8@demo.app | investor1@demo.app … investor5@demo.app | admin@fundamental.app');
