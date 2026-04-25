import "server-only";

import { Resend } from "resend";

/**
 * Activation email helper. W3 wires this; W4's assign-plan server action
 * is what actually calls it. The function is intentionally minimal — body
 * copy is rendered inline per locale rather than via a template engine,
 * because we ship one tiny transactional email and a dependency would
 * outweigh the benefit.
 */

export type SupportedEmailLocale = "de" | "en" | "fr";

export type ActivationEmailParams = {
  to: string;
  planName: string;
  validFrom: Date;
  validUntil: Date;
  locale: SupportedEmailLocale;
};

/**
 * Thrown when `RESEND_API_KEY` is missing. W4 surfaces this to the operator
 * UI so they know the env is incomplete instead of silently failing.
 */
export class EmailNotConfiguredError extends Error {
  constructor(message = "RESEND_API_KEY is not configured") {
    super(message);
    this.name = "EmailNotConfiguredError";
  }
}

const FROM_ADDRESS = "DeutschFit <support@deutschfit.app>";

type Copy = {
  subject: string;
  greeting: string;
  body: string;
  validity: string;
  signOff: string;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildCopy(params: ActivationEmailParams): Copy {
  const validFrom = isoDate(params.validFrom);
  const validUntil = isoDate(params.validUntil);
  switch (params.locale) {
    case "de":
      return {
        subject: `Dein DeutschFit ${params.planName}-Plan ist aktiv`,
        greeting: `Hallo,`,
        body: `dein <strong>${params.planName}</strong>-Plan ist jetzt aktiv. Öffne die App – die Premium-Inhalte werden innerhalb von 30 Sekunden freigeschaltet.`,
        validity: `Gültig vom <strong>${validFrom}</strong> bis <strong>${validUntil}</strong>.`,
        signOff: `Viel Erfolg,<br/>Das DeutschFit-Team`,
      };
    case "fr":
      return {
        subject: `Votre forfait DeutschFit ${params.planName} est actif`,
        greeting: `Bonjour,`,
        body: `votre forfait <strong>${params.planName}</strong> est désormais actif. Ouvrez l'application&nbsp;: les contenus premium se déverrouillent en moins de 30&nbsp;secondes.`,
        validity: `Valable du <strong>${validFrom}</strong> au <strong>${validUntil}</strong>.`,
        signOff: `Bon courage,<br/>L'équipe DeutschFit`,
      };
    case "en":
    default:
      return {
        subject: `Your DeutschFit ${params.planName} plan is active`,
        greeting: `Hi,`,
        body: `your <strong>${params.planName}</strong> plan is now active. Open the app — premium content unlocks within 30 seconds.`,
        validity: `Valid from <strong>${validFrom}</strong> to <strong>${validUntil}</strong>.`,
        signOff: `Viel Erfolg,<br/>The DeutschFit team`,
      };
  }
}

function renderHtml(copy: Copy): string {
  return [
    `<html><body style="font-family:Inter,system-ui,sans-serif;line-height:1.5;color:#1a1714">`,
    `<p>${copy.greeting}</p>`,
    `<p>${copy.body}</p>`,
    `<p>${copy.validity}</p>`,
    `<p>${copy.signOff}</p>`,
    `<hr/>`,
    `<p style="font-size:12px;color:#6e6257">Need help? <a href="mailto:support@deutschfit.app">support@deutschfit.app</a></p>`,
    `</body></html>`,
  ].join("");
}

function renderText(copy: Copy): string {
  const stripTags = (s: string) =>
    s
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
  return [
    stripTags(copy.greeting),
    stripTags(copy.body),
    stripTags(copy.validity),
    "",
    stripTags(copy.signOff),
  ].join("\n");
}

/**
 * Send the activation email. Throws `EmailNotConfiguredError` if the
 * Resend API key is missing.
 *
 * @returns the Resend response (or throws if Resend rejects).
 */
export async function sendActivationEmail(params: ActivationEmailParams) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new EmailNotConfiguredError();
  }
  const copy = buildCopy(params);
  const html = renderHtml(copy);
  const text = renderText(copy);
  const resend = new Resend(apiKey);
  return resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: copy.subject,
    html,
    text,
  });
}

// Internal helpers exported for unit tests only — keep the surface area
// of the runtime client small.
export const __test = { buildCopy, renderHtml, renderText };
