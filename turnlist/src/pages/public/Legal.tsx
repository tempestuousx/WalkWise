import { NavLink, useParams } from 'react-router-dom';
import { Page } from '@/components/Layout';
import { Notice, cx } from '@/components/ui';
import NotFound from './NotFound';

/**
 * Policy drafts. These are written to be reviewed by a Nevada-licensed
 * attorney before launch; they describe how the product actually behaves so
 * counsel can check the promises against the implementation.
 */
type Doc = { title: string; summary: string; sections: Array<[string, string[]]> };

const DOCS: Record<string, Doc> = {
  terms: {
    title: 'Terms of use',
    summary: 'The rules for using Turnlist as a business or a contractor.',
    sections: [
      ['What Turnlist is', [
        'Turnlist is an online job board that lets businesses that own or manage property post short-term work, and lets independent contractors find and apply for it.',
        'Turnlist is not a party to any agreement between a business and a contractor. We do not employ contractors, act as a staffing agency or broker, supervise or inspect work, set prices, or collect or hold payment.',
      ]],
      ['Accounts', [
        'You must be at least 18 and able to form a binding contract. Information you provide must be accurate, and you are responsible for activity on your account.',
        'Each account is either a business account or a contractor account. Administrators may suspend accounts that break these terms.',
      ]],
      ['Listings', [
        'Businesses may only post real, currently available work at a property they own or are authorized to manage. Listings must state pay honestly and may not require contractors to pay to apply, buy materials from the poster, or provide financial information.',
        'Listings for work that requires a license or permit must say so. Businesses are responsible for confirming that the contractor they hire holds any license the work requires.',
        'We may hold new listings for review, edit category or location data for accuracy, and remove listings that break the listing standards.',
      ]],
      ['Applications and hiring', [
        'Applying for a job does not create any obligation for either party and does not guarantee work. Selection in Turnlist records a business’s choice; the terms of the work are agreed directly between the business and the contractor.',
        'Turnlist does not guarantee the quality, safety, legality, or timeliness of any work, or that any party will pay or perform.',
      ]],
      ['Fees', [
        'Contractor accounts and applications are free. Businesses currently receive introductory listings at no charge. We will give notice before any fee applies to your account. Turnlist does not charge contractors for leads or access to applicants.',
      ]],
      ['Conduct', [
        'Do not post discriminatory, misleading, or illegal content; harass other users; collect personal information for unrelated purposes; or use Turnlist to solicit payment outside of agreed work.',
      ]],
      ['Disputes and liability', [
        '[To be completed by counsel: limitation of liability, disclaimer of warranties, indemnity, governing law (Nevada), venue, and dispute resolution.]',
      ]],
    ],
  },
  contractors: {
    title: 'Independent contractor notice',
    summary: 'How opportunities on Turnlist differ from traditional employment.',
    sections: [
      ['These are independent contractor opportunities', [
        'Jobs on Turnlist are posted by businesses seeking independent contractors for specific tasks. They are not offers of employment with Turnlist or, unless the business says otherwise in writing, with the business.',
        'As an independent contractor you generally decide whether to accept work, set or negotiate your rate, choose how the work is performed, supply your own tools unless agreed otherwise, and are responsible for your own taxes, insurance, and licensing.',
      ]],
      ['What Turnlist does not do', [
        'Turnlist does not hire, schedule, supervise, train, evaluate, or pay contractors, and does not withhold taxes. Turnlist ratings come from businesses and are not employment reviews.',
      ]],
      ['Licensing in Nevada', [
        'Some trades, including plumbing, electrical, and HVAC, generally require a license from the Nevada State Contractors Board, especially above the handyman exemption limit or when a permit is needed. Do not accept work you are not licensed to perform.',
      ]],
      ['Classification is the parties’ responsibility', [
        'Whether a working relationship is employment or independent contracting depends on the facts of that relationship, not on labels used on Turnlist. Businesses and contractors should seek their own advice. [Counsel to review against NRS 608.0155 and current federal guidance.]',
      ]],
    ],
  },
  privacy: {
    title: 'Privacy',
    summary: 'What we collect, who can see it, and how documents are protected.',
    sections: [
      ['Who sees what', [
        'Public: business name and type, contractor display name, services, general service area, self-reported experience, portfolio photos, reviews, and verified badges.',
        'Only after a contractor applies to a business’s job: that contractor’s phone and email are visible to that business. A business’s contact details are visible to a contractor only after the business selects them.',
        'Exact property addresses are visible only to the business that posted the job and to contractors the business explicitly shares them with.',
      ]],
      ['Verification documents', [
        'Licenses, insurance certificates, and identity documents are stored in private storage. Only you and Turnlist administrators reviewing your request can open them, using links that expire within minutes. They are never shown on your profile; only the resulting badge is.',
      ]],
      ['Notifications', [
        'We send in-app and email notifications according to your settings. Text messages are not sent today; when they are offered, they will require your opt-in.',
      ]],
      ['Retention and requests', [
        '[To be completed by counsel: retention periods, account deletion, data access requests, and Nevada privacy law (NRS 603A) notices.]',
      ]],
    ],
  },
  moderation: {
    title: 'Listing and verification standards',
    summary: 'How listings are reviewed and what verified badges mean.',
    sections: [
      ['Listing review', [
        'Listings from new business accounts are reviewed by our team before they are published. Once an account has a record of legitimate listings, its new listings publish immediately and are reviewed after the fact.',
        'Anyone signed in can report a listing. Reported listings are reviewed, and reporters are not identified to the poster.',
      ]],
      ['We remove listings that', [
        'Are not real or not currently available; ask contractors to pay, buy products, or share banking details; misstate pay; require licensed work without saying so; discriminate; or duplicate an existing listing.',
        'When we reject or remove a listing we tell the business why. Removing an active listing cancels it and notifies applicants.',
      ]],
      ['Account actions', [
        'Accounts that post fraudulent or abusive content may be suspended. Suspension closes the account’s open listings. Every moderation action is logged with the administrator and reason.',
      ]],
      ['Verification', [
        'Badges represent checks our team actually performed: License verified (checked against the issuing board’s public lookup), Insurance verified (certificate reviewed, with expiry date), Business verified (business license or registration reviewed), ID verified (government ID reviewed).',
        'Badges expire with the underlying document. Self-reported licenses and insurance are labeled self-reported and never shown as verified. Turnlist does not run background checks at this time and does not display background-check badges.',
      ]],
    ],
  },
};

export default function Legal() {
  const { doc = 'terms' } = useParams();
  const d = DOCS[doc];
  if (!d) return <NotFound />;
  return (
    <Page>
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Policies" className="flex gap-1 overflow-x-auto lg:flex-col">
          {Object.entries(DOCS).map(([k, v]) => (
            <NavLink key={k} to={`/legal/${k}`} className={({ isActive }) => cx('whitespace-nowrap rounded-lg px-3 py-2 text-[14px] font-medium', isActive ? 'bg-canvas-alt text-navy' : 'text-ink-muted hover:text-navy')}>
              {v.title}
            </NavLink>
          ))}
        </nav>
        <article className="max-w-[68ch]">
          <h1 className="text-h1">{d.title}</h1>
          <p className="mt-2 text-[16px] text-ink-muted">{d.summary}</p>
          <div className="mt-6">
            <Notice tone="warn">Draft prepared for legal review. Not yet reviewed by counsel and not legal advice.</Notice>
          </div>
          {d.sections.map(([h, ps]) => (
            <section key={h} className="mt-9">
              <h2 className="text-[18px]">{h}</h2>
              {ps.map((p, i) => (
                <p key={i} className="mt-3 text-[15.5px] leading-relaxed text-ink">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </article>
      </div>
    </Page>
  );
}
