import { useEffect, useRef, useState } from "react";
import { GlobeScene } from "../components/GlobeScene";
import { api } from "../lib/api";
import { useDeviceTier } from "../lib/device";

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
    return "Capture date unavailable";
  }

  return new Date(value).toLocaleDateString();
}

function buildLightboxImageStyle(imageFillMode: boolean, fillScrollAxis: "x" | "y") {
  if (!imageFillMode) {
    return {
      width: "auto",
      height: "auto",
      maxWidth: "100%",
      maxHeight: "100%",
      objectFit: "contain" as const,
      margin: "auto"
    };
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
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [selected, setSelected] = useState<PublicPhotoGroup | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState("");
  const [panelOpen, setPanelOpen] = useState(tier !== "mobile");
  const [cameraDistance, setCameraDistance] = useState(4.7);
  const [earthPixelDiameter, setEarthPixelDiameter] = useState(0);
  const [imageFillMode, setImageFillMode] = useState(false);
  const [fillScrollAxis, setFillScrollAxis] = useState<"x" | "y">("x");
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const lightboxMediaRef = useRef<HTMLDivElement | null>(null);
  const lightboxImageRef = useRef<HTMLImageElement | null>(null);

  const baseDistance = 4.7;
  const zoomFactor = baseDistance / cameraDistance;

  useEffect(() => {
    setPanelOpen(tier !== "mobile");
  }, [tier]);

  useEffect(() => {
    setCameraDistance(baseDistance);
  }, [baseDistance]);

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    api
      .publicPhotos(mode, tier)
      .then((data) => setItems(data.items))
      .catch((err: Error) => setError(err.message));
  }, [mode, tier]);

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

  return (
    <main className="page public-page">
      <div className={`topbar-panel floating-panel ${panelOpen ? "open" : "collapsed"}`}>
        <div className="floating-panel-header">
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
            mode={mode}
            items={items as never[]}
            focus={currentPhoto ? { latitude: currentPhoto.latitude, longitude: currentPhoto.longitude } : null}
            onModeChange={setMode}
            onCameraDistanceChange={setCameraDistance}
            onEarthPixelDiameterChange={setEarthPixelDiameter}
            onSelect={openPhoto}
          />
        </div>
      </section>
      <div className="globe-debug-panel" aria-live="polite">
        <span>Zoom x{zoomFactor.toFixed(2)}</span>
        <span>Distance {cameraDistance.toFixed(2)}</span>
        <span>Earth {earthPixelDiameter.toFixed(0)}px</span>
        <span>
          Viewport {viewport.width} x {viewport.height}
        </span>
      </div>
      {selected && currentPhoto ? (
        <div className="lightbox" onClick={closeLightbox}>
          <div className="lightbox-panel" onClick={(event) => event.stopPropagation()}>
            <div className="lightbox-media">
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
              {selected.groupCount > 1 ? (
                <>
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
                </>
              ) : null}
              <button
                type="button"
                className="lightbox-zoom-button"
                onClick={() => setImageFillMode((value) => !value)}
                aria-pressed={imageFillMode}
                aria-label={imageFillMode ? "Fit image to frame" : "Fill image frame"}
              >
                {imageFillMode ? "Fit" : "Fill"}
              </button>
            </div>
            <div className="lightbox-copy">
              <p className="lightbox-geo-title">{formatGeoPrimaryLabel(selected.geoPrimaryLabel)}</p>
              <p className="lightbox-place-name">{currentPhoto.locationLabel || "Location label not set."}</p>
              <p>{currentPhoto.description || "No description yet."}</p>
              <p>{formatCapturedDate(currentPhoto.capturedAt)}</p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
