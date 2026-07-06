import { Link, useParams } from 'react-router-dom';
import { Logo } from '../components/ui';

// Lightweight legal/compliance pages. These are baseline templates — have counsel
// review and localise them for your operating jurisdictions before launch.
const DOCS = {
  terms: {
    title: 'Terms of Service',
    updated: 'June 2026',
    body: [
      ['Acceptance', 'By creating an account or using Fundamental, you agree to these Terms of Service and our Privacy Policy. If you do not agree, do not use the platform.'],
      ['What Fundamental is', 'Fundamental is a private platform that connects founders raising capital with investors. We provide tools for company profiles, pitch videos, structured metrics, permissioned data rooms, messaging, and networking. We are a technology provider — not a broker-dealer, investment adviser, exchange, or funding portal — and we do not solicit, negotiate, or execute securities transactions.'],
      ['Not investment advice', 'Nothing on Fundamental, including company profiles, metrics, the Fundamental Score, or auto-generated investment memos, is investment, legal, tax, or financial advice or a recommendation to buy or sell any security. All such information is provided for informational purposes only and may be incomplete or inaccurate. You are solely responsible for your own due diligence and decisions.'],
      ['Eligibility & investor status', 'Investor accounts require approval before accessing deal flow. You must provide accurate information and meet any accreditation or eligibility requirements that apply in your jurisdiction. We may request verification and may approve, decline, suspend, or revoke access at our discretion.'],
      ['Acceptable use', 'You agree not to misrepresent yourself or your company, upload unlawful or infringing content, attempt to access data you are not authorised to view, scrape the platform, or use it to harass others. Founders may only publish information they are authorised to share. You retain ownership of content you upload and grant us a licence to host and display it to permitted users.'],
      ['Confidentiality of data rooms', 'Materials shared in a data room are confidential. If a founder grants you access, you agree to use those materials solely to evaluate the opportunity and not to copy, distribute, or disclose them. Access can be revoked at any time.'],
      ['Account security & termination', 'You are responsible for your credentials and activity. We may suspend or terminate accounts that violate these terms or present a fraud, security, or legal risk.'],
      ['Disclaimers & liability', 'The platform is provided “as is” without warranties of any kind. To the maximum extent permitted by law, Fundamental is not liable for investment losses or for the accuracy of user-provided information. Your use of the platform is at your own risk.'],
      ['Changes', 'We may update these terms; material changes will be notified in-product. Continued use after changes constitutes acceptance.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: 'June 2026',
    body: [
      ['Overview', 'This policy explains what personal data Fundamental collects, how we use it, and your choices. We aim to collect only what we need to operate the platform.'],
      ['What we collect', 'Account details (name, email, optional phone, city), profile and company information you provide, uploaded files (pitch videos, logos, data-room documents), usage and device data, and communications you send through the platform.'],
      ['How we use it', 'To provide and secure the service, verify identity, enable matching and networking, send transactional notifications, prevent fraud and abuse, and comply with legal obligations. We do not sell your personal data.'],
      ['Data rooms & confidentiality', 'Documents you place in a data room are stored privately and shared only with people you authorise. We log access to these documents to support auditability and revocation.'],
      ['Storage & security', 'We use access controls, encryption in transit (HTTPS), bcrypt-hashed passwords, permissioned private storage for data-room documents, and least-privilege access. We do not currently provide encryption at rest or automated malware scanning of uploads — do not upload material you are not comfortable storing under these terms. No system is perfectly secure; please use a strong, unique password.'],
      ['Retention', 'We keep personal data while your account is active. Behavioural analytics (e.g. profile-view events) are retained for up to 180 days, expired verification codes are purged daily, and data-room access logs are kept up to 365 days for security auditing. When you delete your account we remove your records and uploaded files (public uploads and private documents); append-only security audit entries may be retained in pseudonymised form where law permits.'],
      ['Your rights', 'Subject to applicable law (including the Saudi PDPL and comparable regimes), you may access, correct, export, or delete your personal data, and object to certain processing. Account deletion and a full data export are available in Settings. Contact privacy@fundamental.app.'],
      ['International transfers', 'Where data is processed across borders, we apply appropriate safeguards consistent with applicable data-protection law.'],
      ['Contact', 'Questions about this policy or your data: privacy@fundamental.app.'],
    ],
  },
  disclosures: {
    title: 'Investor Risk Disclosures',
    updated: 'June 2026',
    body: [
      ['High-risk investments', 'Investing in early-stage and private companies is highly speculative and carries a significant risk of total loss. These investments are illiquid, may never produce a return, and are suitable only for investors who can bear the loss of their entire investment.'],
      ['Do your own diligence', 'Information on Fundamental is provided by founders and has not been independently verified by us. Verify all figures, claims, and documents directly and seek independent professional advice before investing.'],
      ['No offer or solicitation', 'Listings on Fundamental are not offers to sell or solicitations to buy securities. Any actual investment is a separate, direct arrangement between you and the company, subject to the laws of the relevant jurisdiction.'],
      ['Generated memos', 'Auto-generated investment memos summarise structured platform data using deterministic rules. They are not advice, may be incomplete, and must not be relied upon as the basis for any decision.'],
    ],
  },
};

export default function Legal() {
  const { doc } = useParams();
  const d = DOCS[doc] || DOCS.terms;
  return (
    <div className="min-h-screen bg-ink-950 safe-top safe-bottom">
      <header className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
        <Link to="/"><Logo className="h-[40px]" /></Link>
        <Link to="/" className="btn-ghost btn-sm">Back to Fundamental</Link>
      </header>
      <main className="max-w-3xl mx-auto px-4 pb-20">
        <h1 className="h-display text-3xl">{d.title}</h1>
        <p className="text-xs text-mist-500 mt-1 mb-2">Last updated {d.updated}</p>
        <div className="flex gap-3 text-xs mb-8">
          {Object.entries(DOCS).map(([k, v]) => (
            <Link key={k} to={`/legal/${k}`} className={`hover:text-gold-300 ${k === doc ? 'text-gold-300' : 'text-mist-400'}`}>{v.title}</Link>
          ))}
        </div>
        <div className="space-y-6">
          {d.body.map(([h, p]) => (
            <section key={h}>
              <h2 className="font-display font-bold text-mist-100 text-lg">{h}</h2>
              <p className="text-sm text-mist-300 leading-relaxed mt-1.5">{p}</p>
            </section>
          ))}
        </div>
        <p className="text-[11px] text-mist-500 mt-10 leading-relaxed">
          These documents are provided as operational templates and do not constitute legal advice. Have qualified counsel review and adapt them for your jurisdictions before relying on them.
        </p>
      </main>
    </div>
  );
}
