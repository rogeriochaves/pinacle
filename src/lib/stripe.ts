import Stripe from "stripe";
import { env } from "../env";

/**
 * Stripe client singleton
 * Initialized with API key from environment variables
 */
export const stripe = new Stripe(env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-10-29.clover",
  typescript: true,
  appInfo: {
    name: "Pinacle",
    version: "0.1.0",
  },
});

/**
 * Helper to format amount from cents to dollars
 */
export const formatAmount = (amountInCents: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountInCents / 100);
};

/**
 * Helper to format amount in specific currency
 */
export const formatAmountWithCurrency = (
  amountInCents: number,
  currency: string,
): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountInCents / 100);
};

/**
 * Calculate hourly price from monthly price
 * Assumes 730 hours per month (365 days * 24 hours / 12 months)
 */
export const monthlyToHourly = (monthlyPrice: number): number => {
  return monthlyPrice / 730;
};

/**
 * Calculate monthly price from hourly price
 */
export const hourlyToMonthly = (hourlyPrice: number): number => {
  return hourlyPrice * 730;
};

