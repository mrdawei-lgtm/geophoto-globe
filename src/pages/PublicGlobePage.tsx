import { useEffect, useState } from "react";
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
  groupItems: PublicPhoto[];
  groupIndex: number;
  groupCount: number;
};

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
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

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
  }

  function goToPhoto(index: number) {
    if (!selected) {
      return;
    }
    const nextIndex = (index + selected.groupCount) % selected.groupCount;
    setActiveIndex(nextIndex);
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
              <img src={currentPhoto.imageUrl} alt={currentPhoto.title} />
            </div>
            <div className="lightbox-copy">
              {selected.groupCount > 1 ? (
                <p className="lightbox-position">
                  {activeIndex + 1} / {selected.groupCount}
                </p>
              ) : null}
              {selected.groupCount > 1 ? (
                <div className="lightbox-pagination" aria-label="Photo navigation">
                  <button
                    type="button"
                    className="lightbox-dot lightbox-nav"
                    onClick={() => goToPhoto(activeIndex - 1)}
                    aria-label="Previous photo"
                  >
                    &#9664;
                  </button>
                  {selected.groupItems.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`lightbox-dot ${index === activeIndex ? "active" : ""}`}
                      onClick={() => goToPhoto(index)}
                      aria-label={`Go to photo ${index + 1}`}
                      aria-pressed={index === activeIndex}
                    >
                      {index + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="lightbox-dot lightbox-nav"
                    onClick={() => goToPhoto(activeIndex + 1)}
                    aria-label="Next photo"
                  >
                    &#9654;
                  </button>
                </div>
              ) : null}
              <h2>{currentPhoto.title}</h2>
              <p>{currentPhoto.description || "No description yet."}</p>
              <p>{currentPhoto.locationLabel || "Location label not set."}</p>
              <p>{currentPhoto.capturedAt ? new Date(currentPhoto.capturedAt).toLocaleString() : "Capture time unavailable"}</p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
