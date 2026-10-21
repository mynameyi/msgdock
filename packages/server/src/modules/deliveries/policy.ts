import { SendOutcome } from '@msgdock/contracts';
export function deliveryResult(
  outcome: SendOutcome,
  attempts: number,
  expiresAt: Date,
  now = Date.now(),
) {
  if (outcome.kind === 'accepted') return { status: 'accepted' as const };
  if (outcome.kind === 'unknown') return { status: 'unknown' as const };
  if (outcome.kind === 'failed' || attempts >= 6) return { status: 'failed' as const };
  const delay = Math.max(
    outcome.retryAfterMs ?? 0,
    Math.min(300000, 5000 * 2 ** Math.max(0, attempts - 1)) * (0.9 + Math.random() * 0.2),
  );
  if (now + delay >= expiresAt.getTime()) return { status: 'expired' as const };
  return { status: 'retry_wait' as const, nextAttemptAt: new Date(now + delay) };
}
