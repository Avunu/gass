interface EmailOptions {
  to: string | string[];
  subject: string;
  body: string;
  htmlBody?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: GoogleAppsScript.Base.BlobSource[];
  name?: string;
  noReply?: boolean;
  replyTo?: string;
}

const MAX_DAILY_QUOTA = 100;
let sentEmails = 0;

export function getRemainingQuota(): number {
  const remaining = MailApp.getRemainingDailyQuota();
  return Math.min(remaining, MAX_DAILY_QUOTA - sentEmails);
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  if (getRemainingQuota() <= 0) {
    throw new Error("Daily email quota exceeded");
  }

  const toList = Array.isArray(options.to) ? options.to : [options.to];
  const ccList = options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : [];
  const bccList = options.bcc ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]) : [];

  try {
    GmailApp.sendEmail(toList.join(","), options.subject, options.body, {
      htmlBody: options.htmlBody,
      cc: ccList.join(","),
      bcc: bccList.join(","),
      attachments: options.attachments,
      name: options.name,
      noReply: options.noReply,
      replyTo: options.replyTo,
    });

    sentEmails++;
  } catch (error) {
    console.error("Failed to send email:", error);
    throw new Error(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

export async function sendBulkEmails(emails: EmailOptions[]): Promise<{
  success: number;
  failed: number;
  errors: { email: EmailOptions; error: string }[];
}> {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as { email: EmailOptions; error: string }[],
  };

  for (const email of emails) {
    try {
      if (getRemainingQuota() <= 0) {
        results.errors.push({
          email,
          error: "Daily quota exceeded",
        });
        results.failed++;
        continue;
      }

      await sendEmail(email);
      results.success++;
    } catch (error) {
      results.errors.push({
        email,
        error: error instanceof Error ? error.message : String(error),
      });
      results.failed++;
    }
  }

  return results;
}

export function createDraft(options: EmailOptions): GoogleAppsScript.Gmail.GmailDraft {
  const toList = Array.isArray(options.to) ? options.to : [options.to];
  const ccList = options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : [];
  const bccList = options.bcc ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]) : [];

  return GmailApp.createDraft(toList.join(","), options.subject, options.body, {
    htmlBody: options.htmlBody,
    cc: ccList.join(","),
    bcc: bccList.join(","),
    attachments: options.attachments,
    name: options.name,
    noReply: options.noReply,
    replyTo: options.replyTo,
  });
}

export async function sendTemplate(
  template: string,
  data: Record<string, string>,
  options: Omit<EmailOptions, "body" | "htmlBody">,
): Promise<void> {
  let processed = template;

  // Replace template variables
  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, "g");
    processed = processed.replace(regex, value);
  });

  // Check if template is HTML
  const isHtml = /<[a-z][\s\S]*>/i.test(processed);

  await sendEmail({
    ...options,
    body: isHtml ? processed.replace(/<[^>]*>/g, "") : processed,
    htmlBody: isHtml ? processed : undefined,
  });
}
