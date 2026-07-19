// =====================================
// ROUTING MANAGER
// =====================================
// Proveedor principal: instancias públicas de OSRM
// (routing.openstreetmap.de). Son gratuitas, no requieren
// API key, y ofrecen perfil "foot" (peatón) y "car" (vehículo).
//
// Fallback: servidor demo oficial de OSRM (solo vehículo),
// por si el proveedor principal está caído.

const OSRM_FOOT_URL =
  "https://routing.openstreetmap.de/routed-foot/route/v1/foot";

const OSRM_CAR_URL =
  "https://routing.openstreetmap.de/routed-car/route/v1/driving";

const OSRM_CAR_FALLBACK_URL =
  "https://router.project-osrm.org/route/v1/driving";

// =====================================
// PUNTO DE ENTRADA
// =====================================

async function calculateRouteByMode(start, end, mode) {
  if (mode === "walking") {
    return await fetchOSRMRoute(OSRM_FOOT_URL, start, end);
  }

  try {
    return await fetchOSRMRoute(OSRM_CAR_URL, start, end);
  } catch (error) {
    console.warn("Proveedor principal de auto falló, usando fallback:", error);

    return await fetchOSRMRoute(OSRM_CAR_FALLBACK_URL, start, end);
  }
}

// =====================================
// PETICION GENERICA A UN SERVIDOR OSRM
// =====================================

async function fetchOSRMRoute(baseUrl, start, end) {
  const url = `${baseUrl}/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&steps=true&geometries=geojson`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Error del servidor de rutas (${response.status})`);
  }

  const data = await response.json();

  if (data.code !== "Ok" || !data.routes || !data.routes.length) {
    throw new Error("No se encontró una ruta entre esos puntos");
  }

  return normalizeOSRMRoute(data.routes[0]);
}

// =====================================
// NORMALIZAR RESPUESTA OSRM -> FORMATO COMUN
// =====================================

function normalizeOSRMRoute(route) {
  const rawSteps = route.legs?.[0]?.steps || [];

  return {
    distance: route.distance,

    duration: route.duration,

    geometry: route.geometry,

    steps: rawSteps.map((step) => ({
      name: step.name,

      distance: step.distance,

      maneuver: step.maneuver,
    })),
  };
}

// =====================================
// LUGARES CERCANOS (POIs) - Overpass API
// =====================================
// Overpass es gratuito y sin API key, pero tiene política de uso justo.
// El throttling real vive en map.js (checkNearbyPOIs) — acá solo se
// hace la consulta cuando map.js decide que corresponde.

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

async function fetchNearbyPOIs(lat, lon, radius = 120) {
  const query = `
    [out:json][timeout:10];
    (
      node["amenity"="police"](around:${radius},${lat},${lon});
      node["amenity"="place_of_worship"](around:${radius},${lat},${lon});
      node["amenity"="pharmacy"](around:${radius},${lat},${lon});
      node["shop"](around:${radius},${lat},${lon});
      node["highway"="traffic_signals"](around:${radius},${lat},${lon});
      node["highway"="crossing"](around:${radius},${lat},${lon});
    );
    out body;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    body: query,
  });

  if (!response.ok) {
    throw new Error(`Error del servidor de lugares (${response.status})`);
  }

  const data = await response.json();

  return (data.elements || []).map(normalizePOI).filter((poi) => poi !== null);
}

// =====================================
// CLASIFICAR ETIQUETAS OSM -> POI LEGIBLE
// =====================================

function normalizePOI(element) {
  const tags = element.tags || {};

  const category = classifyPOI(tags);

  if (!category) return null;

  return {
    id: element.id,
    lat: element.lat,
    lon: element.lon,
    name: tags.name || category.defaultName,
    icon: category.icon,
    label: category.label,
  };
}

function classifyPOI(tags) {
  if (tags.amenity === "police") {
    return { icon: "🚓", label: "Policía", defaultName: "Comisaría" };
  }

  if (tags.amenity === "place_of_worship") {
    return { icon: "⛪", label: "Iglesia", defaultName: "Lugar de culto" };
  }

  if (tags.amenity === "pharmacy") {
    return { icon: "💊", label: "Farmacia", defaultName: "Farmacia" };
  }

  if (tags.shop) {
    return { icon: "🛍️", label: "Tienda", defaultName: "Tienda" };
  }

  if (tags.highway === "traffic_signals") {
    return { icon: "🚦", label: "Cruce", defaultName: "Semáforo" };
  }

  if (tags.highway === "crossing") {
    return { icon: "🚸", label: "Cruce peatonal", defaultName: "Cruce" };
  }

  return null;
}

// =====================================
// BUSQUEDA DE LUGARES (Geocoding) - Nominatim
// =====================================
// Permite marcar un destino automáticamente por nombre/dirección,
// en vez de tocar el mapa manualmente. Gratis, sin API key.
// Solo se llama cuando el usuario busca algo (no en loop), así que
// no compite con el límite de uso de Nominatim que ya cuidamos
// en updateStreet().

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

// =====================================
// BUSQUEDA DE LUGARES (Geocoding) - Nominatim
// =====================================
// Prioriza resultados cercanos a "near" (tu ubicación actual):
// 1) se sesga la consulta con un viewbox alrededor tuyo
// 2) el orden final se recalcula en el cliente por distancia real

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

async function searchPlace(query, near = null) {
  let url = `${NOMINATIM_SEARCH_URL}?q=${encodeURIComponent(query)}&format=json&limit=10&addressdetails=1`;

  if (near) {
    // caja de ~0.15° (~15-16km) alrededor de la ubicación actual.
    // bounded=0 = sesgo (prioriza sin descartar resultados fuera)
    const delta = 0.15;

    const viewbox = [
      near.lon - delta,
      near.lat + delta,
      near.lon + delta,
      near.lat - delta,
    ].join(",");

    url += `&viewbox=${viewbox}&bounded=0`;
  }

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "es",
    },
  });

  if (!response.ok) {
    throw new Error(`Error de búsqueda (${response.status})`);
  }

  const data = await response.json();

  const results = data.map((item) => ({
    id: item.place_id,
    name: item.display_name,
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
  }));

  // orden final garantizado por distancia real, no solo por el
  // sesgo aproximado que aplicó el servidor
  if (near) {
    results.forEach((r) => {
      r.distance = haversineDistance(near.lat, near.lon, r.lat, r.lon);
    });

    results.sort((a, b) => a.distance - b.distance);
  }

  return results.slice(0, 5);
}
