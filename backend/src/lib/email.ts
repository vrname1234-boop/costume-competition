import { Resend } from 'resend';
import { config } from '../config';
import { logger } from './logger';

const resend = config.mail.resendApiKey ? new Resend(config.mail.resendApiKey) : null;

interface Mail {
  to: string;
  subject: string;
  text: string;
}

async function send(mail: Mail): Promise<void> {
  if (config.mail.toConsole || !resend) {
    logger.info(
      { to: mail.to, subject: mail.subject, body: mail.text },
      'DEV EMAIL (not delivered - DEV_EMAIL_TO_CONSOLE is on)',
    );
    return;
  }
  const { error } = await resend.emails.send({
    from: config.mail.from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
  });
  if (error) {
    logger.error({ err: error, to: mail.to }, 'failed to send email');
    throw new Error('email_send_failed');
  }
}

export async function sendVerificationCode(
  to: string,
  code: string,
  competitionName: string,
): Promise<void> {
  await send({
    to,
    subject: `Your verification code: ${code}`,
    text: [
      `Your verification code for the ${competitionName} is:`,
      '',
      code,
      '',
      'This code expires in 10 minutes.',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
  });
}

export async function sendPasswordResetCode(
  to: string,
  code: string,
  competitionName: string,
): Promise<void> {
  await send({
    to,
    subject: `Password reset code: ${code}`,
    text: [
      `Someone asked to reset the password for your ${competitionName} account.`,
      '',
      `Your reset code is: ${code}`,
      '',
      'This code expires in 10 minutes.',
      'If this was not you, no action is needed and your password stays unchanged.',
    ].join('\n'),
  });
}

export async function sendSubmissionDecision(
  to: string,
  approved: boolean,
  reason: string | null,
  competitionName: string,
): Promise<void> {
  await send({
    to,
    subject: approved
      ? `Your ${competitionName} entry has been approved`
      : `Your ${competitionName} entry needs changes`,
    text: approved
      ? `Your costume entry has been approved. Nothing further is needed.`
      : [
          'Your costume entry was not approved.',
          '',
          `Reason: ${reason ?? 'No reason given.'}`,
          '',
          'You can sign in and submit an updated entry before the deadline.',
        ].join('\n'),
  });
}
