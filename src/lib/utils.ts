import { type ClassValue, clsx } from "clsx";
import crypto from "crypto";
import ksuid from "ksuid";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const generateKSUID = (resource: string): string => {
  const randomPart = crypto.randomBytes(16);
  return `${resource}_${ksuid.fromParts(Date.now(), randomPart).string}`;
};
