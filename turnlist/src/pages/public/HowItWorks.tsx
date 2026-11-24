import { Link } from 'react-router-dom';
import { Page } from '@/components/Layout';
import { HowItWorksSection } from './Home';

const FAQ: Array<[string, string]> = [
  ['Is Turnlist an employer or staffing agency?', 'No. Turnlist is a job board. Businesses post work, independent contractors apply, and the two agree on terms directly. We do not employ contractors, supervise work, set rates, or process payments.'],
  ['What does it cost?', 'Contractors join and apply for free. Businesses get introductory listings at no cost. Paid plans for frequent posters are planned and will be announced before they apply to you.'],
  ['What do the verified badges mean?', 'A badge appears only after our team reviews a document, such as an insurance certificate or a Nevada State Contractors Board license, and it has not expired. Information people enter themselves is shown as self-reported.'],
  ['When does a contractor see the property address?', 'Listings show the neighborhood and ZIP. The business chooses when to share the exact address, usually after selecting someone.'],
  ['Which areas are covered?', 'The Las Vegas valley: Las Vegas, Henderson, North Las Vegas, Summerlin, Centennial Hills, Enterprise, Spring Valley, and Boulder City. More cities will follow.'],
];

export default function HowItWorks() {
  return (
    <>
      <Page narrow>
        <p className="eyebrow">How It Works</p>
        <h1 className="mt-3 text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-bold leading-[1.08] tracking-[-0.03em]">Short-term property work, without the guesswork.</h1>
        <p className="mt-5 text-[17px] leading-relaxed text-ink-muted">
          Turnlist is a local job board for rental turnovers, repairs, cleaning, and property prep. Businesses post individual or recurring jobs. Independent contractors find and apply for the ones that fit.
        </p>
      </Page>
      <HowItWorksSection />
      <Page narrow>
        <h2 className="text-[22px]">Common questions</h2>
        <dl className="mt-6 divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <div key={q} className="py-5">
              <dt className="font-semibold text-navy">{q}</dt>
              <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">{a}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/employer/post" className="btn-primary">
            Post a Job
          </Link>
          <Link to="/jobs" className="btn-secondary">
            Find Work
          </Link>
        </div>
      </Page>
    </>
  );
}
