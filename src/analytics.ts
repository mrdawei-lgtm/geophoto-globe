const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() ?? "";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let analyticsLoaded = false;

function loadAnalytics() {
  if (!measurementId || analyticsLoaded || typeof document === "undefined") {
    return;
  }

  analyticsLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

export function trackPageView(path: string) {
  if (!measurementId || typeof window === "undefined" || path.startsWith("/admin")) {
    return;
  }

  loadAnalytics();
  window.gtag?.("event", "page_view", {
    page_location: window.location.href,
    page_path: path,
    page_title: document.title
  });
}

export function trackEvent(eventName: string, params: Record<string, string | number | boolean>) {
  if (!measurementId || typeof window === "undefined" || window.location.pathname.startsWith("/admin")) {
    return;
  }

  loadAnalytics();
  window.gtag?.("event", eventName, params);
}
