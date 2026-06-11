# Fundamental — Product Audit & Roadmap

*An opinionated review of the platform as evaluated by a Tier-1 VC, a Linear/Stripe-calibre designer, a LinkedIn growth lead, a Series-A founder, and an active angel. Goal: evolve from "startup marketplace" into the operating system for private-market fundraising — Bloomberg Terminal × LinkedIn × AngelList × Carta × PitchBook.*

## Honest critique of the current product

1. **Trust was asserted, not demonstrated.** A "Verified" tick with no visible methodology is decoration. Investors need evidence: scored profiles with explainable breakdowns, update cadence, data-room hygiene. → Fundamental Score shipped (see below).
2. **The watchlist was a bookmark folder, not a workflow.** Investors live in pipelines, not lists. → Rebuilt as a Pipeline board (Tracking → Intro → Diligence → Term Sheet → Passed).
3. **No reason to return daily.** Discover is a directory; directories decay. Retention requires a *stream of state changes*: founder updates, metric deltas, round progress. → Founder Updates shipped; watchers get notified.
4. **Sourcing had no intelligence.** Every investor saw the same grid. → Thesis-Fit % per card + "Best Thesis Fit" sort shipped. This is the seed of the AI matching engine.
5. **Visual noise diluted the premium feel.** Triple-chip rows on every card, saturated navy surfaces, two competing accent systems. → Graphite/near-black surfaces, blue confined to accents, cards decluttered to one metric line.
6. **The feed had no format discipline.** → 400-char hard cap (server-enforced), Status/Image/Video formats, category + format filters.

## Prioritized roadmap

### P0 — Must have (shipped in this iteration ✅)
| Feature | Why it matters | User benefit | Business benefit | Moat | Complexity |
|---|---|---|---|---|---|
| **Fundamental Score** (0–100, explainable: completeness 40 / traction 30 / engagement 20 / trust 10) | Trust is the currency of private markets | Investors triage in seconds; founders get a roadmap to improve | Score becomes the market's shared language → defensible data asset | Crunchbase/AngelList have nothing explainable | M |
| **Thesis-Fit matching** | Sourcing is the #1 investor job-to-be-done | "92% fit" beats scrolling | Better matches → more connects → network effect flywheel | Proprietary interaction graph improves it over time | S |
| **Investor Pipeline (CRM board)** | Investors manage 30–100 live deals; today they do it in Notion | Full deal workflow without leaving the platform | Platform becomes system-of-record → daily active usage | Switching costs compound with every note | M |
| **Founder Updates (400-char, metric snapshots, watcher notifications)** | The #1 retention loop in private markets is the monthly update | Founders compound investor attention; investors get living deal data | Every update pings N watchers back into the app | Update history = unique longitudinal dataset | M |
| **Premium graphite design system + light mode** | Perceived quality gates institutional adoption | Less noise, faster scanning | Brand credibility vs. Carta/AngelList | — | M |

### P1 — High impact (next)
| Feature | Why | Complexity |
|---|---|---|
| **AI Investment Memo Generator** — one-click structured memo (positioning, metrics, risks, comparable rounds) from profile + data room | Cuts diligence from hours to minutes; massive wow-moment. Template engine first, LLM behind an API key | M |
| **AI Due-Diligence Assistant** — Q&A over a startup's data room with citations | The single biggest time sink in venture | L |
| **Warm Intro Graph** — "You → Vikram → Ananya" paths using the connection graph | Replicates the real social mechanics of venture; pure network effect | M |
| **Founder Analytics** — who viewed, watch-time per pitch chapter, data-room engagement heatmap | Founders return daily to see who's circling | M |
| **Deal Alerts** — saved searches push notifications when new startups match | Brings investors back without opening the app | S |
| **Public read-only startup pages** (SEO + share links with OG cards) | Top-of-funnel growth engine; every founder shares their own profile | S |

### P2 — Nice to have
| Feature | Why | Complexity |
|---|---|---|
| **Syndicates & SPV management** — lead investors pool checks with docs and carry tracking | AngelList's core monetization; high willingness-to-pay | XL |
| **Portfolio tracking for investors** — mark invested, track founder updates as portfolio reporting | Keeps investors engaged *after* the deal — the "not actively fundraising" retention answer | M |
| **Events & Demo Days** — scheduled live pitch sessions with RSVP and replay | Recurring calendar moments; community gravity | L |
| **Reputation system** — investor responsiveness scores, founder update streaks | Two-sided accountability; nobody else dares to score investors | M |
| **Verified metrics integrations** (Stripe/Razorpay/banking read-only) | "Carta-grade" data trust; the endgame for the Score | XL |

### P3 — Future vision
- **Secondary marketplace** for verified cap-table positions (requires licensing)
- **Capital-as-a-product**: revenue-based financing offers triggered by verified metrics
- **LP layer**: funds-of-funds discovering emerging managers via fund performance graphs
- **API/terminal product**: sell anonymized private-market intelligence (the Bloomberg move)

## Monetization path
1. **Founder Pro** (₹/$ subscription): analytics, unlimited data-room docs, priority placement.
2. **Investor Pro**: advanced filters, alerts, AI memos, CRM exports, API.
3. **Transaction layer** (later): SPV fees, syndicate carry share — the AngelList model.
4. **Data layer** (endgame): aggregated market intelligence subscriptions.

## Engineering notes
- Score/fit computations are deterministic SQL-side helpers (`server/db.js`) — cheap, explainable, and replaceable by learned models later without UI changes.
- All caps and permissions enforced server-side; the client is presentation only.
- Next structural steps for scale: move SQLite → Postgres, add WebSocket layer for live notifications, object storage for uploads.
