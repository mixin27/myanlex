import type { SendMail } from '../../common/mail/smtp-transport.js';

export type ScriptMailResult = 'sent' | 'failed' | 'skipped';

const day = (date: Date) => date.toISOString().slice(0, 10);

/** The email a requester receives when their plan change is decided. */
export function decisionEmail(
  decision:
    | { kind: 'applied'; startsAt: Date; startedEarly: boolean }
    | { kind: 'rejected'; reason: string },
  change: {
    requesterEmail: string;
    organization: { name: string };
    plan: { name: string };
  },
) {
  const workspace = change.organization.name;
  if (decision.kind === 'applied')
    return {
      to: change.requesterEmail,
      subject: `${workspace} is moving to the ${change.plan.name} plan`,
      text: [
        `Your request to move "${workspace}" to the ${change.plan.name} plan was approved.`,
        '',
        `The plan applies from ${day(decision.startsAt)} (UTC)${
          decision.startedEarly
            ? ', the day it was approved, because the requested date had passed'
            : ''
        }.`,
        'Each month is billed on the plan in effect at its end. You can see the plan and this month’s charges on the Billing page.',
      ].join('\n'),
    };
  return {
    to: change.requesterEmail,
    subject: `Your plan change for ${workspace} wasn't approved`,
    text: [
      `Your request to move "${workspace}" to the ${change.plan.name} plan wasn't approved.`,
      '',
      `Reason: ${decision.reason}`,
      '',
      'The workspace stays on its current plan. You can send a new request from the Billing page.',
    ].join('\n'),
  };
}

/** Best-effort send; scripts report the outcome and never fail because of mail. */
export async function sendDecision(
  send: SendMail | null,
  message: ReturnType<typeof decisionEmail>,
): Promise<ScriptMailResult> {
  if (!send) return 'skipped';
  try {
    await send(message);
    return 'sent';
  } catch {
    return 'failed';
  }
}
