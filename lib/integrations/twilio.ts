import { env } from "@/lib/env";
import Twilio from "twilio";

export function getTwilioClient() {
  return Twilio(env.TWILIO_ACCOUNT_SID ?? "", env.TWILIO_AUTH_TOKEN ?? "");
}

