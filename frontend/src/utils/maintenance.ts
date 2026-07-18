import type { Timestamp } from 'firebase/firestore';

const DUE_SOON_DAYS = 30; // documents (insurance/permit/FC/PUC)
const SERVICE_DUE_SOON_DAYS = 7; // matches PROJECT_SPEC.md's "Oil Change Due in 5 Days" example

export type ExpiryStatus = 'expired' | 'due-soon' | 'ok';

export interface ExpiryInfo {
  daysLeft: number;
  status: ExpiryStatus;
}

const daysUntil = (date: Timestamp): number =>
  Math.ceil((date.toDate().getTime() - Date.now()) / 86_400_000);

export const expiryInfo = (date: Timestamp | null | undefined, dueSoonDays = DUE_SOON_DAYS): ExpiryInfo | null => {
  if (!date) return null;
  const daysLeft = daysUntil(date);
  const status: ExpiryStatus = daysLeft < 0 ? 'expired' : daysLeft <= dueSoonDays ? 'due-soon' : 'ok';
  return { daysLeft, status };
};

export const serviceDueInfo = (date: Timestamp | null | undefined): ExpiryInfo | null =>
  expiryInfo(date, SERVICE_DUE_SOON_DAYS);
