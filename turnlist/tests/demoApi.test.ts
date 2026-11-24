import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoApi, memoryStorage, type DemoApi } from '@/data/demoApi';
import { addDays, toDayString } from '@/domain/format';
import type { JobInput } from '@/domain/validation';

let api: DemoApi;
beforeEach(async () => {
  api = createDemoApi({ storage: memoryStorage() });
  await api.reset();
});

const input = (over: Partial<JobInput> = {}): JobInput => ({
  title: 'Turnover clean unit 5', category_id: 'cat_turnover-cleaning', description: 'One bedroom turnover, standard clean, empty unit.',
  zip: '89117', property_type: 'apartment', job_date: toDayString(addDays(new Date(), 2)), deadline: null, duration_hours: 3,
  pay_type: 'fixed', pay_min: 140, pay_max: null, experience_required: null, license_required: false, insurance_required: false,
  materials: 'provided', urgency: 'within_7_days', is_recurring: false, recurrence_note: null, photos: [],
  street_address: '123 Private St', unit: '5', access_notes: 'Lockbox 1234', ...over,
});

describe('hiring workflow', () => {
  it('runs post → apply → shortlist → select → complete with notifications', async () => {
    await api.signInAs('usr_emp_desert');
    const job = await api.createJob(input());
    expect(job.moderation_status).toBe('approved');

    await api.signInAs('usr_con_marco');
    const notes = await api.listNotifications();
    expect(notes.some((n) => n.type === 'new_matching_job' && n.link === `/jobs/${job.id}`)).toBe(true);
    const detail = await api.getJob(job.id);
    expect(detail.privateDetails).toBeNull(); // address hidden until shared
    const app = await api.applyToJob(job.id, { message: 'I can do this Thursday morning with my own supplies.', proposed_rate: null, available_on: null });
    expect(app.is_qualified).toBe(true);
    await expect(api.applyToJob(job.id, { message: 'Applying a second time to the same job.', proposed_rate: null, available_on: null })).rejects.toThrow(/already applied/);

    await api.signInAs('usr_con_aisha');
    const other = await api.applyToJob(job.id, { message: 'I am available and can bring a helper with me.', proposed_rate: null, available_on: null });
    expect(other.is_qualified).toBe(false);

    await api.signInAs('usr_emp_desert');
    expect((await api.getJob(job.id)).job.application_count).toBe(2);
    await api.setApplicationStatus(app.id, 'shortlisted');
    await api.shareAddress(job.id, 'usr_con_marco');
    const filled = await api.selectApplication(app.id);
    expect(filled.status).toBe('filled');
    const apps = await api.listApplicantsForEmployer(job.id);
    expect(apps.find((a) => a.application.id === other.id)!.application.status).toBe('not_selected');

    await api.signInAs('usr_con_marco');
    expect((await api.getJob(job.id)).privateDetails?.street_address).toBe('123 Private St');
    const types = (await api.listNotifications()).map((n) => n.type);
    expect(types).toEqual(expect.arrayContaining(['application_shortlisted', 'contractor_selected']));
    expect((await api.listAvailableJobs()).some((j) => j.id === job.id)).toBe(false);

    await api.signInAs('usr_con_aisha');
    expect((await api.getJob(job.id)).privateDetails).toBeNull();

    await api.signInAs('usr_emp_desert');
    await api.setJobStatus(job.id, 'in_progress');
    await api.setJobStatus(job.id, 'completed');
    await expect(api.setJobStatus(job.id, 'open')).rejects.toThrow();
    const review = await api.createReview(job.id, 5, 'Great work');
    expect(review.reviewee_id).toBe('usr_con_marco');
  });

  it('reopens a filled job when the selected contractor withdraws', async () => {
    await api.signInAs('usr_emp_desert');
    const job = await api.createJob(input());
    await api.signInAs('usr_con_marco');
    const app = await api.applyToJob(job.id, { message: 'Available all week, happy to help with this.', proposed_rate: null, available_on: null });
    await api.signInAs('usr_emp_desert');
    await api.selectApplication(app.id);
    await api.signInAs('usr_con_marco');
    await api.withdrawApplication(app.id);
    await api.signInAs('usr_emp_desert');
    const d = await api.getJob(job.id);
    expect(d.job.status).toBe('open');
    expect(d.job.selected_application_id).toBeNull();
  });
});

describe('access control (mirrors RLS)', () => {
  it('stops employers from managing other employers listings and applicants', async () => {
    await api.signInAs('usr_emp_halvorsen');
    await expect(api.setJobStatus('job_1', 'canceled')).rejects.toThrow(/own listings/);
    await expect(api.updateJob('job_1', input())).rejects.toThrow(/own listings/);
    await expect(api.selectApplication('app_2')).rejects.toThrow(/own listings/);
    await expect(api.listApplicantsForEmployer('job_1')).rejects.toThrow(/not found/i);
  });
  it('stops contractors from changing other contractors applications or employer-only statuses', async () => {
    await api.signInAs('usr_con_aisha');
    await expect(api.withdrawApplication('app_1')).rejects.toThrow(/not found/i);
    await expect(api.setApplicationStatus('app_2', 'shortlisted')).rejects.toThrow(/access/);
    await expect(api.createJob(input())).rejects.toThrow(/access/);
  });
  it('restricts admin endpoints and hides pending listings from the public', async () => {
    await api.signInAs('usr_con_marco');
    await expect(api.adminMetrics()).rejects.toThrow(/access/);
    await expect(api.getJob('job_17')).rejects.toThrow(/does not exist/);
    await api.signOut();
    await expect(api.listMyJobs()).rejects.toThrow(/Sign in/);
  });
  it('hides contractor contact details until they apply to you', async () => {
    await api.signInAs('usr_emp_halvorsen');
    expect((await api.getContractor('usr_con_marco')).contact).toBeNull();
    await api.signInAs('usr_emp_desert');
    expect((await api.getContractor('usr_con_marco')).contact?.phone).toBeTruthy();
  });
  it('only lets parties linked by an application open a conversation', async () => {
    await api.signInAs('usr_con_aisha');
    await expect(api.startConversation('usr_emp_halvorsen', null)).rejects.toThrow(/Messaging opens/);
    const id = await api.startConversation('usr_emp_canyon', 'job_4');
    await api.sendMessage(id, 'Hello, confirming tomorrow at 8.');
    await api.signInAs('usr_con_marco');
    await expect(api.sendMessage(id, 'hi')).rejects.toThrow(/not found/i);
  });
});

describe('moderation and admin', () => {
  it('holds new employers listings for review and notifies matches on approval', async () => {
    await api.signInAs('usr_emp_new');
    await api.saveBusinessProfile({ company_name: 'Okafor Homes', business_type: 'landlord', phone: null, website: null, about: null, zip: null });
    const job = await api.createJob(input({ zip: '89117' }));
    expect(job.moderation_status).toBe('pending');
    expect((await api.listAvailableJobs()).some((j) => j.id === job.id)).toBe(false);
    await api.signInAs('usr_admin');
    await expect(api.adminModerateJob(job.id, 'reject', '')).rejects.toThrow(/reason/);
    await api.adminModerateJob(job.id, 'approve', null);
    expect((await api.adminListActions())[0].action).toBe('moderate:approve');
    await api.signInAs('usr_con_marco');
    expect((await api.listNotifications()).some((n) => n.link === `/jobs/${job.id}`)).toBe(true);
  });
  it('suspension cancels open listings and blocks sign in', async () => {
    await api.signInAs('usr_admin');
    await api.adminSetUserStatus('usr_emp_canyon', 'suspended', 'Fraudulent listings');
    expect((await api.listAvailableJobs()).some((j) => j.employer_id === 'usr_emp_canyon')).toBe(false);
    await expect(api.signIn('priya@example.com', 'demo1234')).rejects.toThrow(/suspended/);
  });
  it('computes the primary success metric over mature, approved listings', async () => {
    await api.signInAs('usr_admin');
    const m = await api.adminMetrics();
    expect(m.primary.eligible).toBeGreaterThan(0);
    expect(m.primary.rate).toBeGreaterThanOrEqual(0);
    expect(m.primary.rate).toBeLessThanOrEqual(1);
    expect(m.pendingModeration).toBe(1);
  });
});
