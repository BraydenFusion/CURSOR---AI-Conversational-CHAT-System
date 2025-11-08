import Stripe from "stripe";
import { env } from "@/lib/env";

export function getStripeClient() {
  return new Stripe(env.stripeSecretKey, {
    apiVersion: "2024-06-20"
  });
}

