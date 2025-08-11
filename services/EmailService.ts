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

export class EmailService {
  private static readonly MAX_DAILY_QUOTA = 100;
  private static sentEmails = 0;

  static getRemainingQuota(): number {
    const remaining = MailApp.getRemainingDailyQuota();
    return Math.min(remaining, this.MAX_DAILY_QUOTA - this.sentEmails);
  }

  static async sendEmail(options: EmailOptions): Promise<void> {
    if (this.getRemainingQuota() <= 0) {
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

      this.sentEmails++;
    } catch (error) {
      console.error("Failed to send email:", error);
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static async sendBulkEmails(emails: EmailOptions[]): Promise<{
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
        if (this.getRemainingQuota() <= 0) {
          results.errors.push({
            email,
            error: "Daily quota exceeded",
          });
          results.failed++;
          continue;
        }

        await this.sendEmail(email);
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

  static createDraft(options: EmailOptions): GoogleAppsScript.Gmail.GmailDraft {
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

  static async sendTemplate(
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

    await this.sendEmail({
      ...options,
      body: isHtml ? processed.replace(/<[^>]*>/g, "") : processed,
      htmlBody: isHtml ? processed : undefined,
    });
  }
}
