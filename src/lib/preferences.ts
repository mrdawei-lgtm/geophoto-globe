const PUBLIC_DEBUG_PANEL_VISIBLE_KEY = "publicDebugPanelVisible";

export function readPublicDebugPanelVisible() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(PUBLIC_DEBUG_PANEL_VISIBLE_KEY) === "true";
}

export function writePublicDebugPanelVisible(visible: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PUBLIC_DEBUG_PANEL_VISIBLE_KEY, String(visible));
}
