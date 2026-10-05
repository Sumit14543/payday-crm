/**
 * Google Maps Geocoding Service
 * Converts latitude and longitude coordinates to address details via Google Maps Geocoding API.
 */

const DEFAULT_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyASdz_lCbjWIJHXQIlKOdVIzKwwBqgYYcY';

async function getAddressFromLatLng(lat, lng) {
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    return null;
  }

  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);

  if (isNaN(numLat) || isNaN(numLng)) {
    return null;
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || DEFAULT_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${numLat},${numLng}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Geocoding API] HTTP error ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
      console.warn(`[Geocoding API] Status: ${data.status}`);
      return null;
    }

    const firstResult = data.results[0];
    const formattedAddress = firstResult.formatted_address || '';

    let city = '';
    let state = '';
    let country = '';
    let pincode = '';

    if (Array.isArray(firstResult.address_components)) {
      for (const comp of firstResult.address_components) {
        const types = comp.types || [];
        if (types.includes('locality')) {
          city = comp.long_name || comp.short_name || '';
        } else if (!city && types.includes('administrative_area_level_2')) {
          city = comp.long_name || comp.short_name || '';
        }

        if (types.includes('administrative_area_level_1')) {
          state = comp.long_name || comp.short_name || '';
        }
        if (types.includes('country')) {
          country = comp.long_name || comp.short_name || '';
        }
        if (types.includes('postal_code')) {
          pincode = comp.long_name || comp.short_name || '';
        }
      }
    }

    return {
      formattedAddress,
      city,
      state,
      country,
      pincode,
      lat: numLat,
      lng: numLng,
    };
  } catch (err) {
    console.error('[Geocoding API Error]:', err.message);
    return null;
  }
}

module.exports = {
  getAddressFromLatLng,
};
