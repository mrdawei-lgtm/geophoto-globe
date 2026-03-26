import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "../analytics";
import { GlobeScene } from "../components/GlobeScene";
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [cameraDistance, setCameraDistance] = useState(4.7);
  const [earthPixelDiameter, setEarthPixelDiameter] = useState(0);
  const [framesPerSecond, setFramesPerSecond] = useState(0);
  const [debugPanelVisible, setDebugPanelVisible] = useState(() => readPublicDebugPanelVisible());
  const [themeId, setThemeId] = useState(() => readPublicThemeId());
  const [imageFillMode, setImageFillMode] = useState(false);
  const [fillScrollAxis, setFillScrollAxis] = useState<"x" | "y">("x");
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const lightboxMediaRef = useRef<HTMLDivElement | null>(null);
  const lightboxImageRef = useRef<HTMLImageElement | null>(null);

  const baseDistance = 4.7;
  const zoomFactor = baseDistance / cameraDistance;
  const theme = getPublicTheme(themeId);
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

  useEffect(() => {
    setImageFillMode(false);
  }, [selected?.id, activeIndex]);

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

  async function openPhoto(id: string) {
    try {
      const nextSelected = await api.publicPhoto(id);
      setSelected(nextSelected);
      setActiveIndex(nextSelected.groupIndex);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open photo");
    }
  }

  const currentPhoto = selected?.groupItems[activeIndex] ?? null;

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
    setSelected(null);
    setActiveIndex(0);
    setImageFillMode(false);
  }

  function goToPhoto(index: number) {
    if (!selected) {
      return;
    }
    const nextIndex = (index + selected.groupCount) % selected.groupCount;
    setActiveIndex(nextIndex);
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
      <div className={`topbar-panel floating-panel ${panelOpen ? "open" : "collapsed"}`}>
        <div className="floating-panel-header floating-panel-controls">
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
          <button type="button" className="panel-toggle" onClick={() => setPanelOpen((value) => !value)}>
            {panelOpen ? "Hide" : "Info"}
          </button>
        </div>
        <div className={`floating-panel-body ${panelOpen ? "open" : "collapsed"}`}>
          <div className="floating-summary">
            <span>Drag to rotate the globe.</span>
            <span>Zoom in to switch from clusters to photo cards.</span>
            <span>Click any photo to open the large preview.</span>
          </div>
          {error ? <p className="floating-error">{error}</p> : null}
        </div>
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
      {selected && currentPhoto ? (
        <div className="lightbox" onClick={closeLightbox}>
          <div className="lightbox-panel" onClick={(event) => event.stopPropagation()}>
            <div className="lightbox-media">
              <div className="lightbox-media-viewport">
                <div
                  ref={lightboxMediaRef}
                  className={`lightbox-media-frame ${imageFillMode ? `fill-mode scroll-${fillScrollAxis}` : "fit-mode"}`}
                >
                  <img
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
