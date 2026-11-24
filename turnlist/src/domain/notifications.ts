import type { NotificationPreferences, NotificationType } from './types';

export const NOTIFICATION_TYPES: { type: NotificationType; label: string; audience: 'contractor' | 'employer' | 'all' }[] = [
  { type: 'new_matching_job', label: 'New jobs that match my services and area', audience: 'contractor' },
  { type: 'application_shortlisted', label: 'I am shortlisted for a job', audience: 'contractor' },
  { type: 'contractor_selected', label: 'I am selected, or I select a contractor', audience: 'all' },
  { type: 'application_not_selected', label: 'A business chose someone else', audience: 'contractor' },
  { type: 'application_received', label: 'New application on my listing', audience: 'employer' },
  { type: 'job_canceled', label: 'A job I applied to is canceled', audience: 'contractor' },
  { type: 'deadline_approaching', label: 'A job deadline is approaching', audience: 'all' },
  { type: 'new_message', label: 'New message', audience: 'all' },
  { type: 'listing_moderated', label: 'My listing is approved or removed', audience: 'employer' },
  { type: 'verification_updated', label: 'A verification review is finished', audience: 'all' },
];

export function defaultPreferences(): NotificationPreferences {
  const prefs = {} as NotificationPreferences;
  for (const { type } of NOTIFICATION_TYPES) {
    // SMS is modeled now but not delivered until a later version.
    prefs[type] = { in_app: true, email: type !== 'new_message', sms: false };
  }
  return prefs;
}
