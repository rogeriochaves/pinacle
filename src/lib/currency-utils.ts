/**
 * Currency detection and utilities
 */

import type { Currency } from "./pod-orchestration/resource-tier-registry";

export type { Currency };

/**
 * European countries that use Euro or where Euro makes most sense
 */
const EURO_COUNTRIES = [
  "AT", // Austria
  "BE", // Belgium
  "HR", // Croatia
  "CY", // Cyprus
  "EE", // Estonia
  "FI", // Finland
  "FR", // France
  "DE", // Germany
  "GR", // Greece
  "IE", // Ireland
  "IT", // Italy
  "LV", // Latvia
  "LT", // Lithuania
  "LU", // Luxembourg
  "MT", // Malta
  "NL", // Netherlands
  "PT", // Portugal
  "SK", // Slovakia
  "SI", // Slovenia
  "ES", // Spain
  // Non-Eurozone EU countries where EUR makes sense
  "BG", // Bulgaria
  "CZ", // Czech Republic
  "DK", // Denmark
  "HU", // Hungary
  "PL", // Poland
  "RO", // Romania
  "SE", // Sweden
  // Other European countries
  "CH", // Switzerland
  "NO", // Norway
  "IS", // Iceland
  "GB", // United Kingdom
];

/**
 * Get currency from country code
 * Logic:
 * - Europe (and nearby): EUR
 * - Brazil: BRL
 * - Everywhere else: USD
 */
export const getCurrencyFromCountry = (countryCode: string): Currency => {
  if (countryCode === "BR") {
    return "brl";
  }

  if (EURO_COUNTRIES.includes(countryCode)) {
    return "eur";
  }

  return "usd";
};

/**
 * Format currency with symbol
 */
export const formatCurrency = (
  amount: number,
  currency: Currency,
  options?: { showDecimals?: boolean },
): string => {
  const showDecimals = options?.showDecimals ?? true;

  const symbols: Record<Currency, string> = {
    usd: "$",
    eur: "€",
    brl: "R$",
  };

  const formatted = showDecimals
    ? amount.toFixed(2)
    : Math.round(amount).toString();

  return `${symbols[currency]}${formatted}`;
};

/**
 * Calculate hourly price from monthly price
 * Assumes 730 hours per month (365 days * 24 hours / 12 months)
 */
export const monthlyToHourly = (monthlyPrice: number): number => {
  return monthlyPrice / 730;
};

/**
 * Format hourly price with proper decimals
 */
export const formatHourlyPrice = (
  monthlyPrice: number,
  currency: Currency,
): string => {
  const hourlyPrice = monthlyToHourly(monthlyPrice);
  const symbols: Record<Currency, string> = {
    usd: "$",
    eur: "€",
    brl: "R$",
  };

  // Format with 3-4 decimal places for small amounts
  const formatted = hourlyPrice < 0.1
    ? hourlyPrice.toFixed(4)
    : hourlyPrice.toFixed(3);

  return `${symbols[currency]}${formatted}`;
};

