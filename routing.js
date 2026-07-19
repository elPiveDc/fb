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
