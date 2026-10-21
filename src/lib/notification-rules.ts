export const MANDATORY_NOTIFICATION_KINDS = ['rma_issued', 'account_disabled', 'account_enabled', 'failed_payment'] as const;
export type NotificationMethod = 'email' | 'text' | 'both';
export function notificationAllowed(kind: string, account: boolean, marketing: boolean) {
  return (MANDATORY_NOTIFICATION_KINDS as readonly string[]).includes(kind) || (kind === 'marketing' ? marketing : account);
}
export function contactCanAttempt(failures: number) { return failures < 5; }
export function automaticAttemptDue(tries: number, lastAttempt: number, now: number) {
  return tries < 3 && now - lastAttempt >= 24 * 60 * 60 * 1000;
}