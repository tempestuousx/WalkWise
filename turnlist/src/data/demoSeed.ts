import { DEFAULT_CATEGORIES } from '@/domain/categories';
import { DEFAULT_MARKET_ID, areaForZip } from '@/domain/market';
import { addDays, toDayString } from '@/domain/format';
import { defaultExpiry } from '@/domain/jobs';
import { defaultPreferences } from '@/domain/notifications';
import type {
  AdminAction,
  Application,
  BusinessProfile,
  Category,
  ContractorProfile,
  Conversation,
  Job,
  JobPrivateDetails,
  Message,
  Notification,
  NotificationPreferences,
  Profile,
  Report,
  Review,
  SavedContractor,
  Verification,
} from '@/domain/types';

/**
 * Example data for demo mode only. Every record is flagged is_demo and the UI
 * labels it "Example". None of these businesses, people, or jobs are real.
 * Dates are generated relative to "now" so the demo never looks stale.
 */

export interface DemoDb {
  version: number;
  seededAt: string;
  users: Array<Profile & { password_hash: string }>;
  businesses: BusinessProfile[];
  contractors: ContractorProfile[];
  categories: Category[];
  jobs: Job[];
  privateDetails: JobPrivateDetails[];
  applications: Application[];
  savedJobs: Array<{ contractor_id: string; job_id: string; created_at: string }>;
  savedContractors: SavedContractor[];
  conversations: Conversation[];
  messages: Message[];
  notifications: Notification[];
  preferences: Record<string, NotificationPreferences>;
  reviews: Review[];
  verifications: Verification[];
  adminActions: AdminAction[];
  reports: Report[];
  emailOutbox: Array<{ notification_id: string; to: string; created_at: string }>;
}

export const DEMO_DB_VERSION = 3;
export const DEMO_PASSWORD = 'demo1234';

export const DEMO_ACCOUNTS = [
  { id: 'usr_emp_desert', role: 'employer', label: 'Property manager', name: 'Dana Whitfield', org: 'Desert Ridge Property Co.' },
  { id: 'usr_con_marco', role: 'contractor', label: 'Contractor', name: 'Marco Ruiz', org: 'Ruiz Turnover Services' },
  { id: 'usr_admin', role: 'admin', label: 'Administrator', name: 'Platform Admin', org: null },
] as const;

const hour = 3_600_000;

export function buildSeed(passwordHash: string, now = new Date()): DemoDb {
  const iso = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();
  const day = (offset: number) => toDayString(addDays(now, offset));

  const user = (id: string, role: Profile['role'], email: string, display_name: string, agoDays: number, trust: Profile['trust_level'] = 'trusted'): Profile & { password_hash: string } => ({
    id,
    role,
    email,
    display_name,
    avatar_url: null,
    market_id: DEFAULT_MARKET_ID,
    status: 'active',
    trust_level: trust,
    is_demo: true,
    created_at: iso(agoDays * 24 * hour),
    password_hash: passwordHash,
  });

  const users = [
    user('usr_emp_desert', 'employer', 'dana@example.com', 'Dana Whitfield', 120),
    user('usr_emp_halvorsen', 'employer', 'erik@example.com', 'Erik Halvorsen', 60),
    user('usr_emp_canyon', 'employer', 'priya@example.com', 'Priya Nair', 30),
    user('usr_emp_new', 'employer', 'sam@example.com', 'Sam Okafor', 1, 'new'),
    user('usr_con_marco', 'contractor', 'marco@example.com', 'Marco Ruiz', 200),
    user('usr_con_lena', 'contractor', 'lena@example.com', 'Lena Park', 90),
    user('usr_con_tomas', 'contractor', 'tomas@example.com', 'Tomas Greene', 45),
    user('usr_con_aisha', 'contractor', 'aisha@example.com', 'Aisha Bello', 20),
    user('usr_admin', 'admin', 'admin@example.com', 'Platform Admin', 365),
  ];

  const biz = (user_id: string, company_name: string, business_type: BusinessProfile['business_type'], zip: string, about: string): BusinessProfile => ({
    user_id,
    company_name,
    business_type,
    phone: '(702) 555-0100',
    website: null,
    about,
    zip,
    plan: 'free_intro',
    free_listings_used: 0,
    updated_at: iso(10 * 24 * hour),
  });
  const businesses = [
    biz('usr_emp_desert', 'Desert Ridge Property Co.', 'property_manager', '89135', 'Example company. Manages roughly 300 apartment and single-family rentals across Summerlin and Spring Valley.'),
    biz('usr_emp_halvorsen', 'Halvorsen Rentals', 'landlord', '89074', 'Example company. Family-owned portfolio of townhomes in Henderson.'),
    biz('usr_emp_canyon', 'Red Canyon Investments', 'investor', '89031', 'Example company. Buys, renovates, and leases homes in North Las Vegas.'),
    biz('usr_emp_new', 'Okafor Homes', 'landlord', '89123', 'Example company. Two rental homes.'),
  ];

  const allDays: ContractorProfile['availability']['days'] = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const contractor = (p: Partial<ContractorProfile> & { user_id: string }): ContractorProfile => ({
    business_name: null,
    headline: null,
    bio: null,
    years_experience: null,
    category_ids: [],
    home_zip: null,
    service_radius_miles: 15,
    availability: { accepting_work: true, days: allDays, same_day_ok: false, note: null },
    insurance_self_reported: false,
    licenses: [],
    certifications: [],
    contact_phone: null,
    contact_email: null,
    portfolio: [],
    updated_at: iso(5 * 24 * hour),
    ...p,
  });
  const contractors = [
    contractor({
      user_id: 'usr_con_marco',
      business_name: 'Ruiz Turnover Services',
      headline: 'Turnover cleaning, paint touch-ups, and small repairs',
      bio: 'Example profile. Eight years turning over apartments for property managers on the west side. I work with a two-person crew and can usually start within 48 hours.',
      years_experience: 8,
      category_ids: ['cat_move-out-cleaning', 'cat_turnover-cleaning', 'cat_deep-cleaning', 'cat_painting', 'cat_drywall-repair', 'cat_general-maintenance'],
      home_zip: '89117',
      service_radius_miles: 18,
      availability: { accepting_work: true, days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], same_day_ok: true, note: 'Weekday mornings preferred.' },
      insurance_self_reported: true,
      certifications: ['EPA Lead-Safe Renovator (RRP)'],
      contact_phone: '(702) 555-0142',
      contact_email: 'marco@example.com',
    }),
    contractor({
      user_id: 'usr_con_lena',
      business_name: 'Park Property Photo',
      headline: 'Listing and rental photography, same-week turnaround',
      bio: 'Example profile. Wide-angle interiors, twilight exteriors, and floor plans for rentals and listings.',
      years_experience: 5,
      category_ids: ['cat_real-estate-photography', 'cat_rental-photography', 'cat_property-staging'],
      home_zip: '89052',
      service_radius_miles: 30,
      insurance_self_reported: true,
      contact_email: 'lena@example.com',
    }),
    contractor({
      user_id: 'usr_con_tomas',
      business_name: 'Greene Plumbing & Repair',
      headline: 'Licensed plumber. Leaks, fixtures, water heaters',
      bio: 'Example profile. Residential service plumbing across the valley.',
      years_experience: 14,
      category_ids: ['cat_plumbing', 'cat_general-maintenance', 'cat_appliance-maintenance'],
      home_zip: '89031',
      service_radius_miles: 25,
      insurance_self_reported: true,
      licenses: [{ id: 'lic_1', license_type: 'C-1 Plumbing and Heating', license_number: 'EXAMPLE-0000', issuer: 'Nevada State Contractors Board', expires_on: day(400) }],
      contact_phone: '(702) 555-0177',
    }),
    contractor({
      user_id: 'usr_con_aisha',
      headline: 'Yard cleanups, hauling, and general labor',
      years_experience: 2,
      category_ids: ['cat_landscaping', 'cat_junk-hauling', 'cat_furniture-removal', 'cat_general-labor', 'cat_pressure-washing'],
      home_zip: '89030',
      service_radius_miles: 12,
      availability: { accepting_work: true, days: ['sat', 'sun', 'fri'], same_day_ok: true, note: null },
    }),
  ];

  type JobSeed = Partial<Job> & Pick<Job, 'id' | 'employer_id' | 'title' | 'category_id' | 'description' | 'zip' | 'pay_min'> & { agoHours: number; inDays: number };
  const job = (s: JobSeed): Job => {
    const area = areaForZip(s.zip)!;
    const job_date = day(s.inDays);
    const { agoHours, inDays: _inDays, ...rest } = s;
    void _inDays;
    return {
      market_id: DEFAULT_MARKET_ID,
      neighborhood: area.neighborhood,
      property_type: 'apartment',
      job_date,
      deadline: null,
      duration_hours: null,
      pay_type: 'fixed',
      pay_max: null,
      experience_required: null,
      license_required: false,
      insurance_required: false,
      materials: 'provided',
      urgency: 'within_7_days',
      is_recurring: false,
      recurrence_note: null,
      photos: [],
      status: 'open',
      moderation_status: 'approved',
      moderation_note: null,
      selected_application_id: null,
      application_count: 0,
      is_demo: true,
      created_at: iso(agoHours * hour),
      updated_at: iso(agoHours * hour),
      expires_at: defaultExpiry(job_date, s.deadline ?? null),
      filled_at: null,
      completed_at: null,
      canceled_at: null,
      ...rest,
    };
  };

  const jobs: Job[] = [
    job({ id: 'job_1', employer_id: 'usr_emp_desert', title: 'Apartment move-out cleaning', category_id: 'cat_move-out-cleaning', zip: '89135', pay_min: 180, inDays: 2, agoHours: 3, duration_hours: 5, property_type: 'apartment', urgency: 'within_48_hours', description: '2-bedroom, 2-bath apartment after a 3-year tenancy. Full move-out clean: kitchen appliances inside and out, bathrooms, baseboards, blinds, and floors. Unit is empty.', materials: 'contractor' }),
    job({ id: 'job_2', employer_id: 'usr_emp_desert', title: 'Interior repaint, 1-bed unit', category_id: 'cat_painting', zip: '89147', pay_min: 650, pay_max: 800, inDays: 5, agoHours: 20, duration_hours: 16, description: 'Walls only, one color (Swiss Coffee, flat). About 750 sq ft. Minor nail holes to patch. Paint is supplied; bring your own rollers, tape, and drop cloths.', materials: 'shared', experience_required: '2+ years of interior painting' }),
    job({ id: 'job_3', employer_id: 'usr_emp_halvorsen', title: 'Leaking kitchen faucet and slow drain', category_id: 'cat_plumbing', zip: '89074', pay_type: 'hourly', pay_min: 65, pay_max: 85, inDays: 0, agoHours: 2, duration_hours: 2, property_type: 'townhome_condo', urgency: 'same_day', license_required: true, insurance_required: true, materials: 'contractor', description: 'Tenant-occupied townhome. Kitchen faucet drips constantly and the double sink drains slowly. Replace the faucet if needed (we will reimburse parts with receipt). Tenant is home after 1 pm.' }),
    job({ id: 'job_4', employer_id: 'usr_emp_canyon', title: 'Junk haul-out after eviction', category_id: 'cat_junk-hauling', zip: '89031', pay_min: 350, inDays: 1, agoHours: 6, duration_hours: 4, property_type: 'single_family', urgency: 'within_48_hours', materials: 'none', description: 'Single-family home. Furniture, bagged trash, and a broken treadmill left in the garage and two bedrooms. Roughly one 16-ft trailer load. Dump fees included in the rate.' }),
    job({ id: 'job_5', employer_id: 'usr_emp_desert', title: 'Turnover cleaning, recurring', category_id: 'cat_turnover-cleaning', zip: '89117', pay_min: 150, inDays: 4, agoHours: 30, duration_hours: 4, is_recurring: true, recurrence_note: 'About 4 units a month at the same complex', urgency: 'flexible', description: 'Looking for a reliable cleaner for ongoing turnovers at a 120-unit complex near the Lakes. Mostly 1- and 2-bedroom units. We schedule a few days ahead and pay per unit.', materials: 'provided' }),
    job({ id: 'job_6', employer_id: 'usr_emp_halvorsen', title: 'Listing photos for 3 townhomes', category_id: 'cat_rental-photography', zip: '89012', pay_min: 375, inDays: 6, agoHours: 26, duration_hours: 4, property_type: 'townhome_condo', urgency: 'within_7_days', materials: 'none', description: 'Three vacant townhomes in the same community. 20 to 25 edited photos per unit, delivered as web-sized JPEGs within 3 days. Exterior twilight shots not needed.' }),
    job({ id: 'job_7', employer_id: 'usr_emp_canyon', title: 'Backyard cleanup and gravel refresh', category_id: 'cat_landscaping', zip: '89084', pay_min: 420, inDays: 8, agoHours: 44, duration_hours: 8, property_type: 'single_family', urgency: 'flexible', materials: 'shared', description: 'Remove dead shrubs and weeds, rake and top up desert rock (rock is delivered), and trim two palo verde trees below 10 ft. Haul green waste.' }),
    job({ id: 'job_8', employer_id: 'usr_emp_desert', title: 'Drywall patch and texture, 3 spots', category_id: 'cat_drywall-repair', zip: '89144', pay_min: 240, inDays: 3, agoHours: 9, duration_hours: 4, property_type: 'single_family', materials: 'contractor', description: 'Doorknob hole in hallway, a 10-inch patch in a bedroom closet, and a water-stained ceiling area (leak already fixed). Match orange-peel texture; we will paint.' }),
    job({ id: 'job_9', employer_id: 'usr_emp_halvorsen', title: 'Carpet cleaning, 3 bedrooms', category_id: 'cat_carpet-cleaning', zip: '89014', pay_min: 210, inDays: 2, agoHours: 14, duration_hours: 3, property_type: 'townhome_condo', urgency: 'within_48_hours', materials: 'contractor', description: 'Hot-water extraction for three bedrooms and stairs. Some pet staining in one room. Vacant unit, lockbox access.' }),
    job({ id: 'job_10', employer_id: 'usr_emp_canyon', title: 'Pressure wash driveway and patio', category_id: 'cat_pressure-washing', zip: '89032', pay_min: 160, inDays: 3, agoHours: 50, duration_hours: 3, property_type: 'single_family', materials: 'contractor', description: 'Two-car driveway, front walk, and a covered back patio with oil spots. Water spigot available.' }),
    job({ id: 'job_11', employer_id: 'usr_emp_desert', title: 'Make-ready punch list, 2 units', category_id: 'cat_general-maintenance', zip: '89145', pay_type: 'hourly', pay_min: 35, pay_max: 45, inDays: 1, agoHours: 5, duration_hours: 8, urgency: 'within_48_hours', materials: 'provided', description: 'Replace blinds, swap 6 outlet covers, re-caulk two tubs, adjust closet doors, change smoke detector batteries, and hang a towel bar. Parts on site.', experience_required: 'Previous make-ready or handyman experience' }),
    job({ id: 'job_12', employer_id: 'usr_emp_halvorsen', title: 'Vinyl plank in kitchen and hall', category_id: 'cat_flooring', zip: '89052', pay_min: 900, pay_max: 1100, inDays: 10, agoHours: 70, duration_hours: 16, property_type: 'townhome_condo', urgency: 'flexible', materials: 'provided', description: 'Approximately 320 sq ft of click-lock LVP over existing tile (owner-approved). Remove and reinstall baseboards. Flooring and underlayment are on site.' }),
    job({ id: 'job_13', employer_id: 'usr_emp_canyon', title: 'Post-renovation cleanup', category_id: 'cat_post-construction-cleanup', zip: '89086', pay_min: 300, inDays: 4, agoHours: 33, duration_hours: 6, property_type: 'single_family', materials: 'contractor', description: 'Dust and debris after a kitchen and bath remodel. Wipe all cabinets inside and out, clean windows and tracks, and mop. 1,600 sq ft.' }),
    job({ id: 'job_14', employer_id: 'usr_emp_desert', title: 'Furniture removal before staging', category_id: 'cat_furniture-removal', zip: '89138', pay_min: 200, inDays: 6, agoHours: 18, duration_hours: 3, property_type: 'single_family', materials: 'none', description: 'Move a sofa, two beds, and a dining set from a vacant home to a storage unit 4 miles away. Two people recommended; no truck provided.' }),
    // Filled, completed, pending, and expired examples for dashboards and admin views.
    job({ id: 'job_15', employer_id: 'usr_emp_desert', title: 'Deep clean before new tenant', category_id: 'cat_deep-cleaning', zip: '89128', pay_min: 220, inDays: 1, agoHours: 72, duration_hours: 5, status: 'filled', filled_at: iso(40 * hour), description: 'Occupied-to-vacant deep clean, 3 bedrooms. Includes inside cabinets, oven, and refrigerator.' }),
    job({ id: 'job_16', employer_id: 'usr_emp_desert', title: 'Turnover clean, unit 214', category_id: 'cat_turnover-cleaning', zip: '89117', pay_min: 150, inDays: -6, agoHours: 240, duration_hours: 4, status: 'completed', filled_at: iso(200 * hour), completed_at: iso(140 * hour), description: 'Standard 1-bedroom turnover.' }),
    job({ id: 'job_17', employer_id: 'usr_emp_new', title: 'Replace garage door opener', category_id: 'cat_general-maintenance', zip: '89123', pay_min: 250, inDays: 5, agoHours: 1, duration_hours: 3, property_type: 'single_family', moderation_status: 'pending', description: 'Old chain-drive opener stopped working. Opener unit purchased; need it installed and programmed.' }),
    job({ id: 'job_18', employer_id: 'usr_emp_canyon', title: 'Window cleaning, single story', category_id: 'cat_window-cleaning', zip: '89081', pay_min: 140, inDays: -3, agoHours: 160, duration_hours: 3, property_type: 'single_family', status: 'expired', description: 'Inside and out, 14 windows plus sliding door.' }),
  ];

  const app = (id: string, job_id: string, contractor_id: string, status: Application['status'], agoHours: number, message: string, is_qualified = true): Application => ({
    id,
    job_id,
    contractor_id,
    message,
    proposed_rate: null,
    available_on: null,
    status,
    created_at: iso(agoHours * hour),
    updated_at: iso(agoHours * hour),
    viewed_at: status === 'submitted' ? null : iso((agoHours - 1) * hour),
    is_qualified,
  });
  const applications: Application[] = [
    app('app_1', 'job_2', 'usr_con_marco', 'shortlisted', 12, 'Example application. I can start Monday and finish in two days with my helper. I have painted about forty units for west-side managers this year.'),
    app('app_2', 'job_1', 'usr_con_aisha', 'submitted', 1, 'Example application. Available Thursday morning, I can bring all supplies.', false),
    app('app_3', 'job_3', 'usr_con_tomas', 'submitted', 1, 'Example application. Licensed C-1. I can be there by 2 pm today and carry common faucet models.'),
    app('app_4', 'job_15', 'usr_con_marco', 'selected', 60, 'Example application. Happy to take this one, I am finishing a unit nearby that morning.'),
    app('app_5', 'job_16', 'usr_con_marco', 'selected', 230, 'Example application. Available.'),
    app('app_6', 'job_4', 'usr_con_aisha', 'viewed', 4, 'Example application. I have a 16-ft trailer and a helper. Can do tomorrow at 8 am.'),
    app('app_7', 'job_11', 'usr_con_marco', 'submitted', 2, 'Example application. I do make-ready lists like this every week. Can do both units tomorrow.'),
  ];
  for (const a of applications) {
    const j = jobs.find((x) => x.id === a.job_id)!;
    if (a.status !== 'withdrawn') j.application_count += 1;
    if (a.status === 'selected') j.selected_application_id = a.id;
  }

  const privateDetails: JobPrivateDetails[] = jobs.map((j, i) => ({
    job_id: j.id,
    street_address: `${1000 + i * 37} Example Ave`,
    unit: j.property_type === 'apartment' ? `#${100 + i}` : null,
    access_notes: 'Example access notes. Lockbox code is shared after selection.',
    shared_with: j.id === 'job_15' || j.id === 'job_16' ? ['usr_con_marco'] : [],
  }));

  const conversations: Conversation[] = [
    { id: 'conv_1', job_id: 'job_15', employer_id: 'usr_emp_desert', contractor_id: 'usr_con_marco', created_at: iso(40 * hour), last_message_at: iso(20 * hour) },
  ];
  const messages: Message[] = [
    { id: 'msg_1', conversation_id: 'conv_1', sender_id: 'usr_emp_desert', body: 'Example message. Thanks for taking this. The lockbox code is in the job details now. Tenant moved out yesterday.', created_at: iso(39 * hour), read_at: iso(38 * hour) },
    { id: 'msg_2', conversation_id: 'conv_1', sender_id: 'usr_con_marco', body: 'Example message. Got it. I will be there at 8 and send photos when done.', created_at: iso(20 * hour), read_at: null },
  ];

  const notifications: Notification[] = [
    { id: 'ntf_1', user_id: 'usr_con_marco', type: 'application_shortlisted', title: 'You were shortlisted', body: 'Interior repaint, 1-bed unit', link: '/jobs/job_2', read_at: null, created_at: iso(10 * hour) },
    { id: 'ntf_2', user_id: 'usr_con_marco', type: 'new_matching_job', title: 'New job near you', body: 'Apartment move-out cleaning in Summerlin South', link: '/jobs/job_1', read_at: null, created_at: iso(3 * hour) },
    { id: 'ntf_3', user_id: 'usr_emp_desert', type: 'application_received', title: 'New application', body: 'Marco Ruiz applied to Make-ready punch list, 2 units', link: '/employer/listings/job_11', read_at: null, created_at: iso(2 * hour) },
    { id: 'ntf_4', user_id: 'usr_emp_desert', type: 'new_message', title: 'New message from Marco Ruiz', body: 'Got it. I will be there at 8 and send photos when done.', link: '/messages/conv_1', read_at: null, created_at: iso(20 * hour) },
  ];

  const reviews: Review[] = [
    { id: 'rev_1', job_id: 'job_16', reviewer_id: 'usr_emp_desert', reviewee_id: 'usr_con_marco', rating: 5, body: 'Example review. On time, thorough, and sent photos when finished.', created_at: iso(130 * hour) },
  ];

  const verifications: Verification[] = [
    { id: 'ver_1', user_id: 'usr_con_tomas', kind: 'license', status: 'approved', document_path: null, document_name: 'example-license.pdf', details: 'C-1 license, example number', reviewer_id: 'usr_admin', reviewer_note: 'Checked against the state board lookup (example).', reviewed_at: iso(20 * 24 * hour), expires_on: day(400), created_at: iso(22 * 24 * hour) },
    { id: 'ver_2', user_id: 'usr_con_marco', kind: 'insurance', status: 'pending', document_path: null, document_name: 'example-coi.pdf', details: 'General liability certificate of insurance', reviewer_id: null, reviewer_note: null, reviewed_at: null, expires_on: null, created_at: iso(30 * hour) },
    { id: 'ver_3', user_id: 'usr_emp_desert', kind: 'business', status: 'approved', document_path: null, document_name: 'example-business-license.pdf', details: 'Nevada business license', reviewer_id: 'usr_admin', reviewer_note: null, reviewed_at: iso(90 * 24 * hour), expires_on: null, created_at: iso(95 * 24 * hour) },
  ];

  const preferences: Record<string, NotificationPreferences> = {};
  for (const u of users) preferences[u.id] = defaultPreferences();

  return {
    version: DEMO_DB_VERSION,
    seededAt: now.toISOString(),
    users,
    businesses,
    contractors,
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    jobs,
    privateDetails,
    applications,
    savedJobs: [{ contractor_id: 'usr_con_marco', job_id: 'job_8', created_at: iso(5 * hour) }],
    savedContractors: [{ employer_id: 'usr_emp_desert', contractor_id: 'usr_con_marco', note: 'Example note. Fast on turnovers.', created_at: iso(100 * hour) }],
    conversations,
    messages,
    notifications,
    preferences,
    reviews,
    verifications,
    adminActions: [],
    reports: [{ id: 'rep_1', reporter_id: 'usr_con_aisha', target_type: 'job', target_id: 'job_17', reason: 'Example report. Posted twice with different prices.', status: 'open', created_at: iso(0.5 * hour) }],
    emailOutbox: [],
  };
}
