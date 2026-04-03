import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "../analytics";
import { GlobeScene, type GlobeSelectionSource } from "../components/GlobeScene";
import { api } from "../lib/api";
import { useDeviceTier } from "../lib/device";
import { readPublicDebugPanelVisible } from "../lib/preferences";
import { getPublicTheme, publicThemes, readPublicThemeId, writePublicThemeId } from "../lib/publicTheme";

type PublicPhoto = {
  id: string;
  imageUrl: string;
  title: string;
  description: string;
  capturedAt: string | null;
  locationLabel: string;
  latitude: number | null;
  longitude: number | null;
};

type PublicPhotoGroup = PublicPhoto & {
  geoPrimaryLabel: string;
  groupItems: PublicPhoto[];
  groupIndex: number;
  groupCount: number;
};

type LightboxLaunchSource = GlobeSelectionSource & {
  photoId: string;
};

type LightboxFlight = {
  sourceRect: GlobeSelectionSource["rect"];
  targetRect: GlobeSelectionSource["rect"];
  active: boolean;
  exiting: boolean;
};

const LIGHTBOX_OPEN_ANIMATION_MS = 320;
const LIGHTBOX_REVEAL_SETTLE_MS = 440;
const LIGHTBOX_FLIGHT_EXIT_MS = 180;

function getLightboxTargetRect(viewport: { width: number; height: number }) {
  const screenWidth = Math.max(viewport.width - 1.1 * 16, 0);
  const screenHeight = Math.max(viewport.height - 1.1 * 16, 0);
  const panelWidth = Math.min(1280, screenWidth);
  const panelHeight = Math.min(viewport.height * 0.95, screenHeight);
  return {
    left: (viewport.width - panelWidth) / 2,
    top: (viewport.height - panelHeight) / 2,
    width: panelWidth,
    height: panelHeight
  };
}

function formatGeoPrimaryLabel(label: string) {
  return label.trim() || "Location unavailable";
}

function formatCapturedDate(value: string | null) {
  if (!value) {
    return "----/--/--";
  }

  return new Date(value).toLocaleDateString();
}

function buildLightboxImageStyle(imageFillMode: boolean, fillScrollAxis: "x" | "y") {
  if (!imageFillMode) {
    return undefined;
  }

  if (fillScrollAxis === "x") {
    return {
      width: "auto",
      height: "100%",
      maxWidth: "none",
      maxHeight: "none",
      objectFit: "cover" as const
    };
  }

  return {
    width: "100%",
    height: "auto",
    maxWidth: "none",
    maxHeight: "none",
    objectFit: "cover" as const
  };
}

export function PublicGlobePage() {
  const tier = useDeviceTier();
  const [mode, setMode] = useState<"cluster" | "items">("cluster");
  const [items, setItems] = useState<{ mode: "cluster" | "items"; values: Array<Record<string, unknown>> }>({
    mode: "cluster",
    values: []
  });
  const [selected, setSelected] = useState<PublicPhotoGroup | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState("");
  const [cameraDistance, setCameraDistance] = useState(4.7);
  const [earthPixelDiameter, setEarthPixelDiameter] = useState(0);
  const [framesPerSecond, setFramesPerSecond] = useState(0);
  const [debugPanelVisible, setDebugPanelVisible] = useState(() => readPublicDebugPanelVisible());
  const [themeId, setThemeId] = useState(() => readPublicThemeId());
  const [imageFillMode, setImageFillMode] = useState(false);
  const [fillScrollAxis, setFillScrollAxis] = useState<"x" | "y">("x");
  const [lightboxStage, setLightboxStage] = useState<"closed" | "flight" | "open">("closed");
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxFlight, setLightboxFlight] = useState<LightboxFlight | null>(null);
  const [launchSource, setLaunchSource] = useState<LightboxLaunchSource | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const lightboxMediaRef = useRef<HTMLDivElement | null>(null);
  const lightboxImageRef = useRef<HTMLImageElement | null>(null);
  const lightboxOpenTimerRef = useRef<number | null>(null);
  const lightboxFlightExitTimerRef = useRef<number | null>(null);
  const lightboxFlightFrameRef = useRef<number | null>(null);
  const lightboxEnterFrameRef = useRef<number | null>(null);
  const lightboxSwipeRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0
  });

  const baseDistance = 4.7;
  const zoomFactor = baseDistance / cameraDistance;
  const theme = getPublicTheme(themeId);
  const backgroundScale = useMemo(() => {
    const nextScale = 1 + (zoomFactor - 1) * 0.08;
    return Math.min(1.08, Math.max(0.985, nextScale));
  }, [zoomFactor]);
  const themeStyle = useMemo(
    () => theme.cssVariables as CSSProperties,
    [theme]
  );

  useEffect(() => {
    setCameraDistance(baseDistance);
  }, [baseDistance]);

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "publicDebugPanelVisible") {
        setDebugPanelVisible(readPublicDebugPanelVisible());
      }
      if (event.key === "publicThemeId") {
        setThemeId(readPublicThemeId());
      }
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    api
      .publicPhotos(mode, tier)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setItems({ mode, values: data.items });
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, tier]);

  const visibleItems = items.mode === mode ? items.values : [];
  const currentPhoto = selected?.groupItems[activeIndex] ?? null;
  const swipeEnabled = Boolean(selected && selected.groupCount > 1 && !imageFillMode);

  useEffect(() => {
    setImageFillMode(false);
  }, [selected?.id, activeIndex]);

  useEffect(() => {
    resetLightboxSwipe();
  }, [selected?.id, activeIndex, imageFillMode]);

  useEffect(() => {
    function syncFillScrollAxis() {
      const frame = lightboxMediaRef.current;
      const image = lightboxImageRef.current;
      if (!frame || !image || !image.naturalWidth || !image.naturalHeight) {
        return;
      }

      const frameRatio = frame.clientWidth / frame.clientHeight;
      const imageRatio = image.naturalWidth / image.naturalHeight;
      setFillScrollAxis(imageRatio >= frameRatio ? "x" : "y");
    }

    syncFillScrollAxis();
    window.addEventListener("resize", syncFillScrollAxis);
    return () => window.removeEventListener("resize", syncFillScrollAxis);
  }, [selected?.id, activeIndex, imageFillMode]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    applyPreference();
    mediaQuery.addEventListener("change", applyPreference);
    return () => mediaQuery.removeEventListener("change", applyPreference);
  }, []);

  function clearLightboxOpenAnimation() {
    if (lightboxOpenTimerRef.current !== null) {
      window.clearTimeout(lightboxOpenTimerRef.current);
      lightboxOpenTimerRef.current = null;
    }
    if (lightboxFlightExitTimerRef.current !== null) {
      window.clearTimeout(lightboxFlightExitTimerRef.current);
      lightboxFlightExitTimerRef.current = null;
    }
    if (lightboxFlightFrameRef.current !== null) {
      window.cancelAnimationFrame(lightboxFlightFrameRef.current);
      lightboxFlightFrameRef.current = null;
    }
    if (lightboxEnterFrameRef.current !== null) {
      window.cancelAnimationFrame(lightboxEnterFrameRef.current);
      lightboxEnterFrameRef.current = null;
    }
  }

  useEffect(() => () => clearLightboxOpenAnimation(), []);

  useLayoutEffect(() => {
    if (selected && lightboxStage === "open" && !launchSource) {
      return;
    }

    clearLightboxOpenAnimation();

    if (!selected || !currentPhoto) {
      setLightboxStage("closed");
      setLightboxVisible(false);
      setLightboxFlight(null);
      return;
    }

    if (prefersReducedMotion || !launchSource || launchSource.photoId !== currentPhoto.id) {
      setLightboxStage("open");
      setLightboxVisible(false);
      return;
    }

    const targetRect = getLightboxTargetRect(viewport);
    setLightboxStage("flight");
    setLightboxVisible(false);
    setLightboxFlight({
      sourceRect: launchSource.rect,
      targetRect,
      active: false,
      exiting: false
    });

    lightboxFlightFrameRef.current = window.requestAnimationFrame(() => {
      lightboxFlightFrameRef.current = window.requestAnimationFrame(() => {
        setLightboxFlight((current) => (current ? { ...current, active: true } : current));
      });
    });

    lightboxOpenTimerRef.current = window.setTimeout(() => {
      setLightboxStage("open");
      setLaunchSource(null);
    }, LIGHTBOX_OPEN_ANIMATION_MS);

    return () => clearLightboxOpenAnimation();
  }, [currentPhoto, launchSource, prefersReducedMotion, selected, lightboxStage, viewport]);

  useEffect(() => {
    if (lightboxStage !== "open") {
      setLightboxVisible(false);
      return;
    }

    setLightboxVisible(false);
    lightboxEnterFrameRef.current = window.requestAnimationFrame(() => {
      lightboxEnterFrameRef.current = window.requestAnimationFrame(() => {
        setLightboxVisible(true);
      });
    });

    return () => {
      if (lightboxEnterFrameRef.current !== null) {
        window.cancelAnimationFrame(lightboxEnterFrameRef.current);
        lightboxEnterFrameRef.current = null;
      }
    };
  }, [lightboxStage]);

  useEffect(() => {
    if (!lightboxVisible || !lightboxFlight || lightboxFlight.exiting) {
      return;
    }

    lightboxFlightExitTimerRef.current = window.setTimeout(() => {
      setLightboxFlight((current) => (current ? { ...current, exiting: true } : current));
    }, LIGHTBOX_REVEAL_SETTLE_MS);

    return () => {
      if (lightboxFlightExitTimerRef.current !== null) {
        window.clearTimeout(lightboxFlightExitTimerRef.current);
        lightboxFlightExitTimerRef.current = null;
      }
    };
  }, [lightboxFlight, lightboxVisible]);

  useEffect(() => {
    if (!lightboxFlight?.exiting) {
      return;
    }

    lightboxFlightExitTimerRef.current = window.setTimeout(() => {
      setLightboxFlight(null);
    }, LIGHTBOX_FLIGHT_EXIT_MS);

    return () => {
      if (lightboxFlightExitTimerRef.current !== null) {
        window.clearTimeout(lightboxFlightExitTimerRef.current);
        lightboxFlightExitTimerRef.current = null;
      }
    };
  }, [lightboxFlight?.exiting]);

  async function openPhoto(id: string, source?: GlobeSelectionSource) {
    setLaunchSource(source ? { ...source, photoId: id } : null);
    try {
      const nextSelected = await api.publicPhoto(id);
      setSelected(nextSelected);
      setActiveIndex(nextSelected.groupIndex);
    } catch (err) {
      setLaunchSource(null);
      setError(err instanceof Error ? err.message : "Failed to open photo");
    }
  }

  useEffect(() => {
    if (!selected || !currentPhoto) {
      return;
    }

    trackEvent("lightbox_photo_view", {
      photo_id: currentPhoto.id,
      photo_title: currentPhoto.title || "(untitled)",
      group_index: activeIndex + 1,
      group_count: selected.groupCount
    });
  }, [activeIndex, currentPhoto, selected]);

  function closeLightbox() {
    clearLightboxOpenAnimation();
    setSelected(null);
    setActiveIndex(0);
    setImageFillMode(false);
    setLightboxStage("closed");
    setLightboxVisible(false);
    setLightboxFlight(null);
    setLaunchSource(null);
    lightboxSwipeRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0
    };
  }

  function goToPhoto(index: number) {
    if (!selected) {
      return;
    }
    const nextIndex = (index + selected.groupCount) % selected.groupCount;
    setActiveIndex(nextIndex);
  }

  function resetLightboxSwipe() {
    lightboxSwipeRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0
    };
  }

  function handleLightboxPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!swipeEnabled || event.pointerType === "mouse") {
      return;
    }

    lightboxSwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleLightboxPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!swipeEnabled) {
      return;
    }

    const swipe = lightboxSwipeRef.current;
    if (swipe.pointerId !== event.pointerId) {
      return;
    }

    swipe.lastX = event.clientX;
    swipe.lastY = event.clientY;
  }

  function handleLightboxPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!swipeEnabled) {
      resetLightboxSwipe();
      return;
    }

    const swipe = lightboxSwipeRef.current;
    if (swipe.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetLightboxSwipe();

    const minimumSwipeDistance = 56;
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
    if (!isHorizontalSwipe || Math.abs(deltaX) < minimumSwipeDistance) {
      return;
    }

    goToPhoto(activeIndex + (deltaX < 0 ? 1 : -1));
  }

  function handleLightboxPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    const swipe = lightboxSwipeRef.current;
    if (swipe.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetLightboxSwipe();
  }

  function handleLightboxImageLoad() {
    const frame = lightboxMediaRef.current;
    const image = lightboxImageRef.current;
    if (!frame || !image || !image.naturalWidth || !image.naturalHeight) {
      return;
    }

    const frameRatio = frame.clientWidth / frame.clientHeight;
    const imageRatio = image.naturalWidth / image.naturalHeight;
    setFillScrollAxis(imageRatio >= frameRatio ? "x" : "y");
  }

  function toggleImageFillMode() {
    if (!currentPhoto) {
      return;
    }

    setImageFillMode((value) => {
      const nextValue = !value;
      trackEvent("lightbox_fill_mode_toggle", {
        photo_id: currentPhoto.id,
        photo_title: currentPhoto.title || "(untitled)",
        fill_mode: nextValue ? "fill" : "fit"
      });
      return nextValue;
    });
  }

  function handleThemeChange(nextThemeId: string) {
    const nextTheme = getPublicTheme(nextThemeId);
    setThemeId(nextTheme.id);
    writePublicThemeId(nextTheme.id);
  }

  return (
    <main className="page public-page" data-theme={theme.id} style={themeStyle}>
      <div
        className="public-page-background"
        aria-hidden="true"
        style={{ transform: `scale(${backgroundScale})` }}
      />
      <div className="topbar-panel">
        <label className="theme-switch">
          <span>Theme</span>
          <select value={theme.id} onChange={(event) => handleThemeChange(event.target.value)} aria-label="Select visual theme">
            {publicThemes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="topbar-error">{error}</p> : null}
      </div>
      <section className="hero">
        <div className="globe-shadow-overlay" aria-hidden="true" />
        <div className="hero-scene">
          <GlobeScene
            tier={tier}
            theme={theme}
            mode={mode}
            items={visibleItems as never[]}
            focus={null}
            motionEnabled={!selected}
            onModeChange={setMode}
            onCameraDistanceChange={setCameraDistance}
            onEarthPixelDiameterChange={setEarthPixelDiameter}
            onFramesPerSecondChange={setFramesPerSecond}
            onSelect={openPhoto}
          />
        </div>
      </section>
      {debugPanelVisible ? (
        <div className="globe-debug-panel" aria-live="polite">
          <span>FPS {framesPerSecond ? Math.round(framesPerSecond) : "--"}</span>
          <span>Zoom x{zoomFactor.toFixed(2)}</span>
          <span>Distance {cameraDistance.toFixed(2)}</span>
          <span>Earth {earthPixelDiameter.toFixed(0)}px</span>
          <span>
            Viewport {viewport.width} x {viewport.height}
          </span>
        </div>
      ) : null}
      {lightboxFlight ? (
        <div className="lightbox-flight-layer" aria-hidden="true">
          <div
            className={`lightbox-flight-image ${lightboxFlight.active ? "is-active" : ""} ${lightboxFlight.exiting ? "is-exiting" : ""}`}
            style={{
              left: `${(lightboxFlight.active ? lightboxFlight.targetRect : lightboxFlight.sourceRect).left}px`,
              top: `${(lightboxFlight.active ? lightboxFlight.targetRect : lightboxFlight.sourceRect).top}px`,
              width: `${(lightboxFlight.active ? lightboxFlight.targetRect : lightboxFlight.sourceRect).width}px`,
              height: `${(lightboxFlight.active ? lightboxFlight.targetRect : lightboxFlight.sourceRect).height}px`
            }}
          />
        </div>
      ) : null}
      {selected && currentPhoto && lightboxStage === "open" ? (
        <div className={`lightbox is-open ${lightboxVisible ? "is-visible" : ""}`} onClick={closeLightbox}>
          <div className="lightbox-backdrop" aria-hidden="true" />
          <div className="lightbox-panel" onClick={(event) => event.stopPropagation()}>
            <div className="lightbox-media">
              <div className="lightbox-media-viewport">
                <div
                  ref={lightboxMediaRef}
                  className={`lightbox-media-frame ${imageFillMode ? `fill-mode scroll-${fillScrollAxis}` : "fit-mode"} ${swipeEnabled ? "swipe-enabled" : ""}`}
                  onPointerDown={handleLightboxPointerDown}
                  onPointerMove={handleLightboxPointerMove}
                  onPointerUp={handleLightboxPointerEnd}
                  onPointerCancel={handleLightboxPointerCancel}
                >
                  <img
                    className="lightbox-main-image"
                    ref={lightboxImageRef}
                    src={currentPhoto.imageUrl}
                    alt={currentPhoto.title}
                    onLoad={handleLightboxImageLoad}
                    style={buildLightboxImageStyle(imageFillMode, fillScrollAxis)}
                  />
                </div>
              </div>
              <div className="lightbox-media-controls">
                {selected.groupCount > 1 ? (
                  <div className="lightbox-media-nav">
                    <button
                      type="button"
                      className="lightbox-nav-button lightbox-nav-prev"
                      onClick={() => goToPhoto(activeIndex - 1)}
                      aria-label="Previous photo"
                    >
                      &#9664;
                    </button>
                    <p className="lightbox-position">
                      {activeIndex + 1} / {selected.groupCount}
                    </p>
                    <button
                      type="button"
                      className="lightbox-nav-button lightbox-nav-next"
                      onClick={() => goToPhoto(activeIndex + 1)}
                      aria-label="Next photo"
                    >
                      &#9654;
                    </button>
                  </div>
                ) : (
                  <div />
                )}
                <div className="lightbox-media-actions">
                  <button
                    type="button"
                    className="lightbox-zoom-button"
                    onClick={toggleImageFillMode}
                    aria-pressed={imageFillMode}
                    aria-label={imageFillMode ? "Fit image to frame" : "Fill image frame"}
                  >
                    {imageFillMode ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4" />
                        <path d="M9 9h6v6H9z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5" />
                        <path d="M6 12h12M12 6v12" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    className="lightbox-close-button"
                    onClick={closeLightbox}
                    aria-label="Close preview"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <div className="lightbox-copy">
              <p className="lightbox-place-name">{currentPhoto.locationLabel || "Location label not set."}</p>
              <p className="lightbox-geo-title">{formatGeoPrimaryLabel(selected.geoPrimaryLabel)}</p>
              <p className="lightbox-description">{currentPhoto.description || "No description yet."}</p>
              <p className="lightbox-captured-at">{formatCapturedDate(currentPhoto.capturedAt)}</p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
