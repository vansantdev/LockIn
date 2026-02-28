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

// Optional: manual page_view for SPAs (nice to have)
export function trackPageView(path: string) {
  gtagSafe("config", GA_ID, { page_path: path });
}