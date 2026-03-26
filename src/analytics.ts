const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() ?? "";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let analyticsLoaded = false;
let missingMeasurementIdWarned = false;

function warnMissingMeasurementId() {
  if (measurementId || missingMeasurementIdWarned || typeof console === "undefined") {
    return;
  }

  missingMeasurementIdWarned = true;
  console.warn(
    "Google Analytics is disabled because VITE_GA_MEASUREMENT_ID is not set. Set it before building the frontend."
  );
}

function loadAnalytics() {
  if (!measurementId || analyticsLoaded || typeof document === "undefined") {
    return;
  }

  analyticsLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

export function trackPageView(path: string) {
  warnMissingMeasurementId();

  if (!measurementId || typeof window === "undefined" || path.startsWith("/admin")) {
    return;
  }

  loadAnalytics();
  window.gtag?.("event", "page_view", {
    send_to: measurementId,
    page_location: window.location.href,
    page_path: path,
    page_title: document.title
  });
}

export function trackEvent(eventName: string, params: Record<string, string | number | boolean>) {
  warnMissingMeasurementId();

  if (!measurementId || typeof window === "undefined" || window.location.pathname.startsWith("/admin")) {
    return;
  }

  loadAnalytics();
  window.gtag?.("event", eventName, {
    send_to: measurementId,
    ...params
  });
}
