import darkBackgroundUrl from "../assets/themes/dark-background.jpg";
import brightBackgroundUrl from "../assets/themes/bright-background.jpg";

export type PublicThemeId = "default" | "dark" | "bright";

export type PublicTheme = {
  id: PublicThemeId;
  label: string;
  cssVariables: Record<string, string>;
  globe: {
    oceanColor: string;
    landColor: string;
    gridLineColor: string;
    coastlineColor: string;
    borderColor: string;
    fogColor: string;
    fogEnabled: boolean;
    useUnlitMaterial: boolean;
    innerShellColor: string;
    innerShellOpacity: number;
    outerShellColor: string;
    outerShellOpacity: number;
    cityLabelColor: string;
    cityLabelOutline: string;
    clusterColor: string;
    clusterEmissive: string;
    clusterTextColor: string;
    projectionRingColor: string;
    projectionRingOpacity: number;
  };
};

const PUBLIC_THEME_STORAGE_KEY = "publicThemeId";

export const publicThemes: PublicTheme[] = [
  {
    id: "default",
    label: "Default",
    cssVariables: {
      "--theme-public-background":
        "radial-gradient(circle at top, rgba(255, 255, 255, 0.26), transparent 34%), linear-gradient(180deg, #989ca1 0%, #7f8489 100%)",
      "--theme-shell-color": "#f3f5f6",
      "--theme-floating-panel-bg":
        "linear-gradient(180deg, rgba(124, 129, 134, 0.9), rgba(108, 113, 118, 0.78)), rgba(108, 113, 118, 0.58)",
      "--theme-floating-panel-border": "rgba(255, 255, 255, 0.14)",
      "--theme-panel-toggle-bg": "rgba(232, 236, 238, 0.92)",
      "--theme-panel-toggle-color": "#08131b",
      "--theme-panel-toggle-border": "transparent",
      "--theme-summary-color": "#f5f7f8",
      "--theme-error-color": "#ffe3e3",
      "--theme-accent-color": "#8fcbff",
      "--theme-shadow-overlay":
        "radial-gradient(circle, rgba(20, 24, 29, 0) 34%, rgba(62, 68, 74, 0.16) 58%, rgba(18, 21, 26, 0.44) 78%, rgba(12, 14, 18, 0.68) 100%)",
      "--theme-thumbnail-radius": "14px",
      "--theme-thumbnail-border": "rgba(236, 243, 246, 0.8)",
      "--theme-thumbnail-bg": "rgba(10, 19, 25, 0.88)",
      "--theme-thumbnail-shadow": "0 8px 22px rgba(8, 15, 20, 0.28)",
      "--theme-thumbnail-overflow-bg":
        "radial-gradient(circle at 30% 25%, rgba(148, 212, 255, 0.34), transparent 58%), linear-gradient(145deg, rgba(13, 28, 38, 0.96), rgba(7, 15, 22, 0.94))",
      "--theme-thumbnail-line": "rgba(220, 236, 245, 0.68)",
      "--theme-lightbox-backdrop": "rgba(2, 10, 16, 0.86)",
      "--theme-lightbox-panel-bg": "#06111a",
      "--theme-lightbox-panel-border": "rgba(164, 201, 230, 0.12)",
      "--theme-lightbox-panel-radius": "22px",
      "--theme-lightbox-media-bg": "linear-gradient(180deg, rgba(9, 24, 35, 0.96), rgba(4, 11, 18, 0.96))",
      "--theme-lightbox-media-border": "rgba(164, 201, 230, 0.1)",
      "--theme-lightbox-media-radius": "18px",
      "--theme-lightbox-frame-radius": "14px",
      "--theme-lightbox-viewport-bg": "rgba(3, 10, 15, 0.78)",
      "--theme-lightbox-button-bg": "rgba(6, 17, 26, 0.78)",
      "--theme-lightbox-button-border": "rgba(164, 201, 230, 0.22)",
      "--theme-lightbox-button-color": "#dcecf5",
      "--theme-lightbox-button-radius": "999px",
      "--theme-lightbox-position-bg": "rgba(6, 17, 26, 0.76)",
      "--theme-lightbox-position-border": "rgba(164, 201, 230, 0.16)",
      "--theme-lightbox-position-color": "#8fcbff",
      "--theme-lightbox-geo-title-color": "rgba(199, 217, 226, 0.82)",
      "--theme-lightbox-place-color": "#eef7fc",
      "--theme-lightbox-copy-color": "#c7d9e2",
      "--theme-lightbox-description-color": "#edf3f7",
      "--theme-lightbox-date-color": "rgba(199, 217, 226, 0.76)",
      "--theme-lightbox-title-size": "1.16rem",
      "--theme-lightbox-body-size": "0.96rem",
      "--theme-theme-select-bg": "rgba(12, 18, 24, 0.76)",
      "--theme-theme-select-border": "rgba(255, 255, 255, 0.12)",
      "--theme-theme-select-color": "#eef7fc"
    },
    globe: {
      oceanColor: "#93a7af",
      landColor: "#e1e8eb",
      gridLineColor: "rgba(255,255,255,0.08)",
      coastlineColor: "#d7e1e6",
      borderColor: "#b8c5cc",
      fogColor: "#8f9398",
      fogEnabled: true,
      useUnlitMaterial: false,
      innerShellColor: "#1f2d35",
      innerShellOpacity: 0.18,
      outerShellColor: "#dbe6eb",
      outerShellOpacity: 0.055,
      cityLabelColor: "#f4f8fb",
      cityLabelOutline: "rgba(82,92,100,0.52)",
      clusterColor: "#ff9360",
      clusterEmissive: "#ff5f2e",
      clusterTextColor: "#ffffff",
      projectionRingColor: "#000000",
      projectionRingOpacity: 0
    }
  },
  {
    id: "dark",
    label: "Dark",
    cssVariables: {
      "--theme-public-background":
        `linear-gradient(180deg, rgba(2, 6, 12, 0.34), rgba(2, 8, 16, 0.56)), linear-gradient(135deg, rgba(17, 44, 86, 0.14), rgba(3, 10, 19, 0.08)), url("${darkBackgroundUrl}") center / cover no-repeat`,
      "--theme-shell-color": "#deebf7",
      "--theme-floating-panel-bg":
        "linear-gradient(180deg, rgba(5, 11, 18, 0.94), rgba(3, 8, 14, 0.92)), rgba(3, 8, 14, 0.92)",
      "--theme-floating-panel-border": "rgba(59, 98, 148, 0.58)",
      "--theme-panel-toggle-bg": "rgba(3, 9, 15, 0.94)",
      "--theme-panel-toggle-color": "#dce8f5",
      "--theme-panel-toggle-border": "rgba(59, 98, 148, 0.58)",
      "--theme-summary-color": "#dce8f5",
      "--theme-error-color": "#ffd0d0",
      "--theme-accent-color": "#7fb2ff",
      "--theme-shadow-overlay":
        "radial-gradient(circle, rgba(0, 0, 0, 0) 32%, rgba(0, 13, 28, 0.08) 58%, rgba(0, 4, 10, 0.32) 80%, rgba(0, 0, 0, 0.56) 100%)",
      "--theme-thumbnail-radius": "0px",
      "--theme-thumbnail-border": "rgba(64, 114, 176, 0.72)",
      "--theme-thumbnail-bg": "rgba(0, 0, 0, 0.92)",
      "--theme-thumbnail-shadow": "0 0 0 1px rgba(38, 75, 122, 0.34), 0 10px 24px rgba(0, 0, 0, 0.42)",
      "--theme-thumbnail-overflow-bg":
        "linear-gradient(145deg, rgba(7, 14, 24, 0.98), rgba(2, 7, 14, 0.98))",
      "--theme-thumbnail-line": "rgba(96, 140, 198, 0.62)",
      "--theme-lightbox-backdrop": "rgba(1, 5, 10, 0.92)",
      "--theme-lightbox-panel-bg": "#02070d",
      "--theme-lightbox-panel-border": "rgba(59, 98, 148, 0.58)",
      "--theme-lightbox-panel-radius": "0px",
      "--theme-lightbox-media-bg": "linear-gradient(180deg, rgba(2, 8, 15, 0.98), rgba(1, 4, 10, 0.98))",
      "--theme-lightbox-media-border": "rgba(59, 98, 148, 0.42)",
      "--theme-lightbox-media-radius": "0px",
      "--theme-lightbox-frame-radius": "0px",
      "--theme-lightbox-viewport-bg": "rgba(0, 0, 0, 0.92)",
      "--theme-lightbox-button-bg": "rgba(3, 9, 15, 0.94)",
      "--theme-lightbox-button-border": "rgba(59, 98, 148, 0.58)",
      "--theme-lightbox-button-color": "#d7e5f4",
      "--theme-lightbox-button-radius": "0px",
      "--theme-lightbox-position-bg": "rgba(2, 9, 17, 0.92)",
      "--theme-lightbox-position-border": "rgba(59, 98, 148, 0.48)",
      "--theme-lightbox-position-color": "#8cb8ff",
      "--theme-lightbox-geo-title-color": "rgba(141, 177, 228, 0.82)",
      "--theme-lightbox-place-color": "#eef6ff",
      "--theme-lightbox-copy-color": "#b9cad9",
      "--theme-lightbox-description-color": "#e4edf6",
      "--theme-lightbox-date-color": "rgba(141, 177, 228, 0.74)",
      "--theme-lightbox-title-size": "1.08rem",
      "--theme-lightbox-body-size": "0.92rem",
      "--theme-theme-select-bg": "rgba(2, 8, 14, 0.98)",
      "--theme-theme-select-border": "rgba(59, 98, 148, 0.58)",
      "--theme-theme-select-color": "#e8f2ff"
    },
    globe: {
      oceanColor: "#04070b",
      landColor: "#27333f",
      gridLineColor: "rgba(90,130,196,0.12)",
      coastlineColor: "#384d6f",
      borderColor: "#283b59",
      fogColor: "#02060d",
      fogEnabled: true,
      useUnlitMaterial: false,
      innerShellColor: "#08131f",
      innerShellOpacity: 0.28,
      outerShellColor: "#25538f",
      outerShellOpacity: 0.045,
      cityLabelColor: "#d7e7ff",
      cityLabelOutline: "rgba(8,16,28,0.9)",
      clusterColor: "#8cb8ff",
      clusterEmissive: "#4f76b2",
      clusterTextColor: "#06101a",
      projectionRingColor: "#000000",
      projectionRingOpacity: 0
    }
  },
  {
    id: "bright",
    label: "Bright",
    cssVariables: {
      "--theme-public-background":
        `url("${brightBackgroundUrl}") center / cover no-repeat`,
      "--theme-shell-color": "#1c242c",
      "--theme-floating-panel-bg":
        "linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(245, 247, 249, 0.92)), rgba(255, 255, 255, 0.9)",
      "--theme-floating-panel-border": "rgba(184, 190, 196, 0.68)",
      "--theme-panel-toggle-bg": "rgba(255, 255, 255, 0.96)",
      "--theme-panel-toggle-color": "#1c242c",
      "--theme-panel-toggle-border": "rgba(184, 190, 196, 0.72)",
      "--theme-summary-color": "#28323b",
      "--theme-error-color": "#8a2f2f",
      "--theme-accent-color": "#5b6773",
      "--theme-shadow-overlay":
        "radial-gradient(circle, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0) 100%)",
      "--theme-thumbnail-radius": "999px",
      "--theme-thumbnail-border": "rgba(174, 180, 186, 0.9)",
      "--theme-thumbnail-bg": "rgba(255, 255, 255, 0.96)",
      "--theme-thumbnail-shadow": "0 10px 24px rgba(138, 144, 152, 0.2)",
      "--theme-thumbnail-overflow-bg":
        "linear-gradient(145deg, rgba(247, 248, 250, 0.98), rgba(233, 236, 239, 0.98))",
      "--theme-thumbnail-line": "rgba(66, 80, 93, 0.68)",
      "--theme-lightbox-backdrop": "rgba(240, 242, 245, 0.86)",
      "--theme-lightbox-panel-bg": "#ffffff",
      "--theme-lightbox-panel-border": "rgba(196, 201, 208, 0.86)",
      "--theme-lightbox-panel-radius": "22px",
      "--theme-lightbox-media-bg": "linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(243, 245, 247, 0.98))",
      "--theme-lightbox-media-border": "rgba(206, 211, 217, 0.86)",
      "--theme-lightbox-media-radius": "18px",
      "--theme-lightbox-frame-radius": "20px",
      "--theme-lightbox-viewport-bg": "rgba(238, 241, 244, 0.94)",
      "--theme-lightbox-button-bg": "rgba(255, 255, 255, 0.96)",
      "--theme-lightbox-button-border": "rgba(192, 198, 205, 0.82)",
      "--theme-lightbox-button-color": "#3a434c",
      "--theme-lightbox-button-radius": "999px",
      "--theme-lightbox-position-bg": "rgba(249, 250, 251, 0.98)",
      "--theme-lightbox-position-border": "rgba(202, 207, 214, 0.82)",
      "--theme-lightbox-position-color": "#58636f",
      "--theme-lightbox-geo-title-color": "rgba(94, 103, 114, 0.84)",
      "--theme-lightbox-place-color": "#202930",
      "--theme-lightbox-copy-color": "#4d5863",
      "--theme-lightbox-description-color": "#33404c",
      "--theme-lightbox-date-color": "rgba(98, 108, 120, 0.78)",
      "--theme-lightbox-title-size": "1.12rem",
      "--theme-lightbox-body-size": "0.95rem",
      "--theme-theme-select-bg": "rgba(255, 255, 255, 0.98)",
      "--theme-theme-select-border": "rgba(192, 198, 205, 0.82)",
      "--theme-theme-select-color": "#29323b"
    },
    globe: {
      oceanColor: "#ffffff",
      landColor: "#d9dde1",
      gridLineColor: "rgba(155,165,173,0.12)",
      coastlineColor: "#9ca5ad",
      borderColor: "#7e8891",
      fogColor: "#ffffff",
      fogEnabled: false,
      useUnlitMaterial: true,
      innerShellColor: "#ffffff",
      innerShellOpacity: 0,
      outerShellColor: "#ffffff",
      outerShellOpacity: 0,
      cityLabelColor: "#42505d",
      cityLabelOutline: "rgba(255,255,255,0.92)",
      clusterColor: "#10cfff",
      clusterEmissive: "#00a6d9",
      clusterTextColor: "#42505d",
      projectionRingColor: "#8fd8ff",
      projectionRingOpacity: 0.58
    }
  }
];

const themeMap = new Map(publicThemes.map((theme) => [theme.id, theme]));

export function getPublicTheme(themeId: string | null | undefined) {
  return themeMap.get((themeId ?? "default") as PublicThemeId) ?? themeMap.get("default")!;
}

export function readPublicThemeId() {
  if (typeof window === "undefined") {
    return "default" as PublicThemeId;
  }

  const stored = window.localStorage.getItem(PUBLIC_THEME_STORAGE_KEY);
  return getPublicTheme(stored).id;
}

export function writePublicThemeId(themeId: PublicThemeId) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PUBLIC_THEME_STORAGE_KEY, themeId);
}
