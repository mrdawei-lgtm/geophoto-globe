import { useEffect, useState } from "react";

export type DeviceTier = "desktop" | "mobile" | "low";

function detectTier(): DeviceTier {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = window.innerWidth < 820;
  const lowMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (coarse || small) {
    return "mobile";
  }
  if (typeof lowMemory === "number" && lowMemory <= 4) {
    return "low";
  }
  return "desktop";
}

export function useDeviceTier() {
  const [tier, setTier] = useState<DeviceTier>(() => detectTier());
  useEffect(() => {
    const onResize = () => setTier(detectTier());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return tier;
}
