import sgMail from "@sendgrid/mail";
import { env } from "@/lib/env";

if (!env.SENDGRID_API_KEY) {
  console.warn("⚠️ SENDGRID_API_KEY not set. Email sending will be disabled.");
} else {
  sgMail.setApiKey(env.SENDGRID_API_KEY);
}

export function getSendGridClient() {
  return sgMail;
}

