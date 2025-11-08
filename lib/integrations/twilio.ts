import { env } from "@/lib/env";
import Twilio from "twilio";

export function getTwilioClient() {
  return Twilio(env.twilioAccountSid, env.twilioAuthToken);
}

