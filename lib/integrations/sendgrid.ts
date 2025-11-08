import sgMail from "@sendgrid/mail";
import { env } from "@/lib/env";

sgMail.setApiKey(env.sendgridApiKey);

export function getSendGridClient() {
  return sgMail;
}

