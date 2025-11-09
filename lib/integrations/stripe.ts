import Stripe from "stripe";
import { env } from "@/lib/env";

export function getStripeClient() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16"
  });
}

