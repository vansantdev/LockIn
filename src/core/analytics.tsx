// src/core/analytics.ts
type GtagFn = (...args: any[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: any[];
  }
}

const GA_ID = "G-5S5XJ0Q7ZG";

// Guarded gtag call so it never crashes dev/build
function gtagSafe(...args: any[]) {
  if (typeof window === "undefined") return;
  const gtag = window.gtag;
  if (typeof gtag === "function") gtag(...args);
}

// Basic event
export function track(eventName: string, params: Record<string, any> = {}) {
  // Never send PII (emails, full names, etc.)
  gtagSafe("event", eventName, params);
}

/**
 * SPA "page view" (works great for PWAs + routing-less apps)
 * Use this when your "page" changes (tabs/screens) even if URL doesn't.
 */
export function trackPageView(path: string) {
  // Updates GA "page_*" fields for SPA tracking
  gtagSafe("config", GA_ID, {
    page_path: path,
    page_title: document?.title ?? "LockIn",
    page_location: window?.location?.href ?? undefined,
  });

  // Optional but helpful: explicit page_view event
  gtagSafe("event", "page_view", {
    page_path: path,
    page_title: document?.title ?? "LockIn",
    page_location: window?.location?.href ?? undefined,
  });
}

/**
 * GA4-friendly screen tracking for tab apps
 * Call this when user switches Today/Weekly/History
 */
export function trackScreen(screenName: string) {
  gtagSafe("event", "screen_view", {
    screen_name: screenName,
    app_name: "LockIn",
  });
}