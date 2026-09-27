// Email delivery via Resend's HTTP API.
//
// `fetch` against api.resend.com rather than Cloudflare's own `send_email`
// binding: that binding needs the sending domain on Cloudflare with Email
// Routing configured and the destination verified, which this project does not
// have.

/** What a send attempt did, so the caller can log it and move on. */
export type EmailResult =
  | { sent: true; id: string | null }
  | { sent: false; skipped: true; reason: string }
  | { sent: false; skipped: false; reason: string };

export interface SendEmailInput {
  apiKey: string | undefined;
  to: string | undefined;
  from: string | undefined;
  subject: string;
  text: string;
  html: string;
}

/**
 * Resend's shared test sender. It needs no domain setup, but it will ONLY
 * deliver to the email address the Resend account itself was verified with —
 * this is the no-domain path. Sending anywhere else requires a verified domain
 * and a matching `RESEND_FROM`.
 */
export const RESEND_TEST_SENDER = "onboarding@resend.dev";

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Send one email. Never throws: a notification channel failing is something the
 * caller logs, not something that should fail a workflow step and re-run it.
 *
 * A missing key or destination is reported as `skipped`, not as an error, so the
 * price check stays runnable before email is configured.
 */
export async function sendAlertEmail({
  apiKey,
  to,
  from,
  subject,
  text,
  html
}: SendEmailInput): Promise<EmailResult> {
  if (!apiKey) return { sent: false, skipped: true, reason: "RESEND_API_KEY is not set" };
  if (!to) return { sent: false, skipped: true, reason: "NOTIFY_EMAIL is not set" };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: from || RESEND_TEST_SENDER,
        to: [to],
        subject,
        text,
        html
      })
    });

    // Resend puts the reason in the body, which is far more useful than the
    // status alone ("domain not verified", "you can only send to your own
    // address with the test sender").
    const body = await response.text();
    if (!response.ok) {
      return {
        sent: false,
        skipped: false,
        reason: `Resend ${response.status}: ${body.slice(0, 300)}`
      };
    }

    let id: string | null = null;
    try {
      id = (JSON.parse(body) as { id?: string }).id ?? null;
    } catch {
      // A 2xx with an unexpected body still means it was accepted.
    }
    return { sent: true, id };
  } catch (error) {
    return {
      sent: false,
      skipped: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}
