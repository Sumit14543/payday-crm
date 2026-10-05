// Exact Location Engine for PayDay CRM using Google Maps Geocoding API

export interface ClientLocationInfo {
  ip: string;
  city: string;
  region: string;
  country: string;
  latitude?: number;
  longitude?: number;
  formattedLocation: string;
  source: 'gps' | 'ip';
}

const LOCATION_STORAGE_KEY = "paydayops.client_location";
const GOOGLE_MAPS_KEY = "AIzaSyASdz_lCbjWIJHXQIlKOdVIzKwwBqgYYcY";

let cachedLocation: ClientLocationInfo | null = null;
let activePromise: Promise<ClientLocationInfo> | null = null;

export function clearStaleLocationCache() {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.source !== 'gps') {
        localStorage.removeItem(LOCATION_STORAGE_KEY);
        cachedLocation = null;
      }
    }
  } catch {
    localStorage.removeItem(LOCATION_STORAGE_KEY);
    cachedLocation = null;
  }
}

export function getCachedLocation(): ClientLocationInfo | null {
  if (cachedLocation && cachedLocation.source === 'gps') return cachedLocation;
  if (typeof window === "undefined") return null;
  
  try {
    const stored = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ClientLocationInfo;
      if (parsed && parsed.source === 'gps') {
        cachedLocation = parsed;
        return cachedLocation;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

export async function detectExactLocation(forceRefresh = false): Promise<ClientLocationInfo> {
  const existing = getCachedLocation();

  if (!forceRefresh && existing && existing.source === 'gps' && existing.formattedLocation) {
    return existing;
  }

  if (activePromise && !forceRefresh) {
    return activePromise;
  }

  activePromise = (async () => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            maximumAge: 0,
            enableHighAccuracy: true,
          });
        });

        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        const gRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_MAPS_KEY}`
        );

        if (gRes.ok) {
          const gData = await gRes.json();
          if (gData.status === "OK" && Array.isArray(gData.results) && gData.results.length > 0) {
            const firstResult = gData.results[0];
            const formatted = firstResult.formatted_address || "";

            let city = "";
            let region = "";
            let country = "India";

            if (Array.isArray(firstResult.address_components)) {
              for (const comp of firstResult.address_components) {
                const types = comp.types || [];
                if (types.includes("locality")) {
                  city = comp.long_name || comp.short_name || "";
                } else if (!city && types.includes("administrative_area_level_2")) {
                  city = comp.long_name || comp.short_name || "";
                }
                if (types.includes("administrative_area_level_1")) {
                  region = comp.long_name || comp.short_name || "";
                }
                if (types.includes("country")) {
                  country = comp.long_name || comp.short_name || "";
                }
              }
            }

            const locationInfo: ClientLocationInfo = {
              ip: existing?.ip || "",
              city: city || "Unknown City",
              region,
              country,
              latitude: lat,
              longitude: lon,
              formattedLocation: formatted || [city, region, country].filter(Boolean).join(", "),
              source: 'gps'
            };

            saveLocationInfo(locationInfo);
            return locationInfo;
          }
        }
      } catch (gpsErr) {
        // Silently fallback to IP location on permission denied or permissions policy restriction
      }
    }

    const fallback: ClientLocationInfo = {
      ip: existing?.ip || "",
      city: "India",
      region: "",
      country: "India",
      formattedLocation: "",
      source: 'ip'
    };
    return fallback;
  })();

  try {
    return await activePromise;
  } finally {
    activePromise = null;
  }
}

function saveLocationInfo(info: ClientLocationInfo) {
  cachedLocation = info;
  try {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(info));
  } catch {
    // Ignore storage quota
  }
}

// Automatically clear stale IP cache on startup (defer GPS detection until requested)
if (typeof window !== "undefined") {
  clearStaleLocationCache();
}
