import { render } from "@react-email/render";
import { Resend } from "resend";
import type { ReactElement } from "react";

let resendSingleton: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!resendSingleton) resendSingleton = new Resend(key);
  return resendSingleton;
}

/** Remitente verificado en Resend (dominio propio). Fallback solo útil en sandbox. */
export function getEmailFrom(): string {
  return (
    process.env.EMAIL_FROM?.trim() || "AfiliAds <onboarding@resend.dev>"
  );
}

export async function sendTransactionalEmail(props: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<{ sent: true } | { skipped: true; reason: "no_api_key" }> {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY no configurada; email omitido");
    return { skipped: true, reason: "no_api_key" };
  }
  const html = await render(props.react);
  const { error } = await resend.emails.send({
    from: getEmailFrom(),
    to: props.to,
    subject: props.subject,
    html,
  });
  if (error) {
    throw new Error(error.message);
  }
  return { sent: true };
}
