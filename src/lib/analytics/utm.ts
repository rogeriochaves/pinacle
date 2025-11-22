// UTM parameter tracking utilities

export type UTMParameters = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
};

const UTM_STORAGE_KEY = "pinacle_utm_params";

/**
 * Captures UTM parameters from URL query string
 */
export const captureUTMFromURL = (): UTMParameters | null => {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const utm: UTMParameters = {};

  const utmSource = params.get("utm_source");
  const utmMedium = params.get("utm_medium");
  const utmCampaign = params.get("utm_campaign");
  const utmTerm = params.get("utm_term");
  const utmContent = params.get("utm_content");

  if (utmSource) utm.utmSource = utmSource;
  if (utmMedium) utm.utmMedium = utmMedium;
  if (utmCampaign) utm.utmCampaign = utmCampaign;
  if (utmTerm) utm.utmTerm = utmTerm;
  if (utmContent) utm.utmContent = utmContent;

  // Only return if at least one UTM parameter exists
  return Object.keys(utm).length > 0 ? utm : null;
};

/**
 * Saves UTM parameters to session storage
 */
export const saveUTMToStorage = (utm: UTMParameters): void => {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
  } catch (error) {
    console.error("Failed to save UTM parameters to storage:", error);
  }
};

/**
 * Retrieves UTM parameters from session storage
 */
export const getUTMFromStorage = (): UTMParameters | null => {
  if (typeof window === "undefined") return null;

  try {
    const stored = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as UTMParameters;
    return parsed;
  } catch (error) {
    console.error("Failed to retrieve UTM parameters from storage:", error);
    return null;
  }
};

/**
 * Clears UTM parameters from session storage
 */
export const clearUTMFromStorage = (): void => {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.removeItem(UTM_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear UTM parameters from storage:", error);
  }
};

/**
 * Server-side: Get UTM parameters from URL search params
 * Use this in API routes and server-side functions
 */
export const getUTMFromSearchParams = (searchParams: URLSearchParams): UTMParameters | null => {
  const utm: UTMParameters = {};

  const utmSource = searchParams.get("utm_source");
  const utmMedium = searchParams.get("utm_medium");
  const utmCampaign = searchParams.get("utm_campaign");
  const utmTerm = searchParams.get("utm_term");
  const utmContent = searchParams.get("utm_content");

  if (utmSource) utm.utmSource = utmSource;
  if (utmMedium) utm.utmMedium = utmMedium;
  if (utmCampaign) utm.utmCampaign = utmCampaign;
  if (utmTerm) utm.utmTerm = utmTerm;
  if (utmContent) utm.utmContent = utmContent;

  return Object.keys(utm).length > 0 ? utm : null;
};

/**
 * Converts UTM parameters to URL search params string
 */
export const utmToSearchParams = (utm: UTMParameters): string => {
  const params = new URLSearchParams();

  if (utm.utmSource) params.set("utm_source", utm.utmSource);
  if (utm.utmMedium) params.set("utm_medium", utm.utmMedium);
  if (utm.utmCampaign) params.set("utm_campaign", utm.utmCampaign);
  if (utm.utmTerm) params.set("utm_term", utm.utmTerm);
  if (utm.utmContent) params.set("utm_content", utm.utmContent);

  return params.toString();
};

/**
 * Appends UTM parameters from storage to a URL
 */
export const appendUTMToUrl = (url: string): string => {
  const utm = getUTMFromStorage();
  if (!utm) return url;

  const utmParams = utmToSearchParams(utm);
  if (!utmParams) return url;

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${utmParams}`;
};

/**
 * Captures UTM parameters from URL and saves to storage if present
 * Returns the captured parameters (or null if none found)
 */
export const captureAndSaveUTM = (): UTMParameters | null => {
  const utm = captureUTMFromURL();
  if (utm) {
    saveUTMToStorage(utm);
  }
  return utm;
};

