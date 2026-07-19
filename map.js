// =====================================
// VARIABLES
// =====================================

let map = null;

let userMarker = null;

let destinationMarker = null;

let routeLayer = null;

let currentLocation = null;

let destination = null;

let currentRoute = null;

let navigationSteps = [];

let darkMode = true;

let darkLayer;

let lightLayer;

// modo navegación

let navigationMode = "walking";

// control de peticiones concurrentes de rutas
let routeRequestId = 0;

// throttle Nominatim (calle actual)
let lastStreetLookup = 0;
let lastStreetCoords = null;
const STREET_LOOKUP_INTERVAL_MS = 3000;
const STREET_LOOKUP_MIN_DISTANCE_M = 15;

// rumbo hacia el objetivo actual (destino o siguiente maniobra)
let targetBearing = 0;

// throttle Overpass (POIs cercanos)
let lastPOILookup = 0;
let lastPOICoords = null;
const POI_LOOKUP_INTERVAL_MS = 20000;
const POI_LOOKUP_MIN_DISTANCE_M = 40;
const POI_NOTIFY_RADIUS_M = 120;
const notifiedPOIIds = new Set();

// =====================================
// ICONOS
// =====================================

const userIcon = L.divIcon({
  className: "",

  html: `

    <div style="
    width:22px;
    height:22px;
    background:#00e5ff;
    border:4px solid white;
    border-radius:50%;
    box-shadow:0 0 15px #00e5ff;">
    </div>

    `,

  iconSize: [22, 22],

  iconAnchor: [11, 11],
});

const destinationIcon = L.divIcon({
  className: "",

  html: "📍",

  iconSize: [32, 32],

  iconAnchor: [16, 32],
});

// =====================================
// CREAR MAPA
// =====================================

function initMap(lat, lon) {
  map = L.map("map", {
    zoomControl: false,
  });

  darkLayer = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",

    {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
    },
  );

  lightLayer = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",

    {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
    },
  );

  darkLayer.addTo(map);

  map.setView(
    [lat, lon],

    17,
  );

  updateUserMarker(
    lat,

    lon,
  );

  setTimeout(() => {
    map.invalidateSize();
  }, 500);

  map.on(
    "click",

    (e) => {
      destination = {
        lat: e.latlng.lat,

        lon: e.latlng.lng,
      };

      if (destinationMarker) {
        map.removeLayer(destinationMarker);
      }

      destinationMarker = L.marker(
        [destination.lat, destination.lon],

        {
          icon: destinationIcon,
        },
      )

        .addTo(map);

      calculateRoute();
    },
  );

  setupMapButtons();
}

// =====================================
// BOTONES
// =====================================

function setupMapButtons() {
  const sizeBtn = document.getElementById("map-size-btn");

  sizeBtn.onclick = () => {
    document

      .getElementById("map-container")

      .classList.toggle("expanded");

    setTimeout(() => {
      map.invalidateSize();
    }, 400);
  };

  const themeBtn = document.getElementById("map-theme-btn");

  themeBtn.onclick = () => {
    if (darkMode) {
      map.removeLayer(darkLayer);

      lightLayer.addTo(map);

      themeBtn.textContent = "☀️";
    } else {
      map.removeLayer(lightLayer);

      darkLayer.addTo(map);

      themeBtn.textContent = "🌙";
    }

    darkMode = !darkMode;
  };

  const modeBtn = document.getElementById("mode-btn");

  if (modeBtn) {
    modeBtn.onclick = () => {
      if (navigationMode === "walking") {
        navigationMode = "driving";

        modeBtn.textContent = "🚗";
      } else {
        navigationMode = "walking";

        modeBtn.textContent = "🚶";
      }

      updateRouteModeLabel();

      if (destination) calculateRoute();
    };
  }
}

// =====================================
// UBICACION
// =====================================

function updateUserLocation(lat, lon) {
  currentLocation = {
    lat,

    lon,
  };

  updateStreet(
    lat,

    lon,
  );

  checkNearbyPOIs(
    lat,

    lon,
  );

  if (!map) {
    initMap(
      lat,

      lon,
    );

    return;
  }

  updateUserMarker(
    lat,

    lon,
  );

  updateTargetBearing();
}

function updateUserMarker(lat, lon) {
  let position = [lat, lon];

  if (!userMarker) {
    userMarker = L.marker(
      position,

      {
        icon: userIcon,
      },
    )

      .addTo(map);
  } else {
    userMarker.setLatLng(position);
  }
}

// =====================================
// MOTOR DE RUTAS
// =====================================

async function calculateRoute() {
  if (!currentLocation || !destination) return;

  const requestId = ++routeRequestId;

  try {
    let route = await calculateRouteByMode(
      currentLocation,

      destination,

      navigationMode,
    );

    if (requestId !== routeRequestId) return;

    currentRoute = route;

    navigationSteps = route.steps || [];

    drawRoute(route.geometry);

    updateNavigationInfo(route);

    updateTargetBearing();
  } catch (error) {
    if (requestId !== routeRequestId) return;

    console.error(
      "Routing error",

      error,
    );

    document.getElementById("instruction").textContent =
      "No se pudo calcular la ruta";
  }
}

// =====================================
// DIBUJAR RUTA
// =====================================

function drawRoute(geometry) {
  if (routeLayer) map.removeLayer(routeLayer);

  let coords = geometry.coordinates.map((point) => [point[1], point[0]]);

  routeLayer = L.polyline(
    coords,

    {
      color: "#00ffff",

      weight: 6,

      opacity: 0.9,
    },
  )

    .addTo(map);

  map.fitBounds(
    routeLayer.getBounds(),

    {
      padding: [40, 40],
    },
  );
}

// =====================================
// INSTRUCCIONES
// =====================================

function updateNavigationInfo(route) {
  document.getElementById("distance").textContent = formatDistance(
    route.distance,
  );

  document.getElementById("eta").textContent =
    Math.ceil(route.duration / 60) + " min";

  if (navigationSteps.length) {
    let step = navigationSteps[0];

    document.getElementById("instruction").textContent =
      generateInstruction(step);
  }
}

function generateInstruction(step) {
  if (!step) return "Continúe";

  let name = step.name || "la ruta";

  let distance = formatDistance(step.distance || 0);

  // ORS

  if (step.instruction) return step.instruction;

  // OSRM

  if (step.maneuver) {
    let modifier = step.maneuver.modifier;

    if (modifier?.includes("left"))
      return `Camina ${distance} y gira a la izquierda por ${name}`;

    if (modifier?.includes("right"))
      return `Camina ${distance} y gira a la derecha por ${name}`;

    if (step.maneuver.type === "depart") return `Comienza por ${name}`;
  }

  return `Continúa por ${name} ${distance}`;
}

// =====================================
// FLECHA DE NAVEGACION (rumbo relativo)
// =====================================
// La flecha apunta hacia el objetivo (siguiente maniobra o destino)
// RELATIVO a hacia dónde está mirando el usuario ahora mismo. Si el
// usuario está de espaldas al objetivo, la flecha gira 180°.

function updateTargetBearing() {
  if (!currentLocation) return;

  let target = destination;

  // si hay un paso de ruta con ubicación exacta, apuntamos ahí
  // (guía giro a giro en vez de solo hacia el destino final)
  if (navigationSteps.length && navigationSteps[0].maneuver?.location) {
    const [lon, lat] = navigationSteps[0].maneuver.location;

    target = { lat, lon };
  }

  if (!target) return;

  targetBearing = calculateBearing(
    currentLocation.lat,
    currentLocation.lon,
    target.lat,
    target.lon,
  );

  renderArrow();
}

function renderArrow() {
  const arrowEl = document.getElementById("arrow");

  if (!arrowEl) return;

  if (!destination) {
    arrowEl.style.transform = "rotate(0deg)";

    return;
  }

  // rotación relativa: rumbo al objetivo menos hacia dónde miro ahora
  const relative = (((targetBearing - currentHeading) % 360) + 360) % 360;

  arrowEl.style.transform = `rotate(${relative}deg)`;
}

// fórmula estándar de rumbo inicial entre dos coordenadas
function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);

  const y = Math.sin(dLon) * Math.cos(toRad(lat2));

  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);

  const bearing = toDeg(Math.atan2(y, x));

  return (bearing + 360) % 360;
}

// =====================================
// MODO
// =====================================

function updateRouteModeLabel() {
  const label = document.getElementById("route-mode");

  if (!label) return;

  label.textContent =
    navigationMode === "walking" ? "🚶 Caminando" : "🚗 Vehículo";
}

// =====================================
// CALLE ACTUAL (throttle Nominatim)
// =====================================

async function updateStreet(lat, lon) {
  const now = Date.now();

  if (lastStreetCoords) {
    const moved = haversineDistance(
      lastStreetCoords.lat,
      lastStreetCoords.lon,
      lat,
      lon,
    );

    const tooSoon = now - lastStreetLookup < STREET_LOOKUP_INTERVAL_MS;
    const tooClose = moved < STREET_LOOKUP_MIN_DISTANCE_M;

    if (tooSoon && tooClose) return;
  }

  lastStreetLookup = now;
  lastStreetCoords = { lat, lon };

  try {
    let response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
    );

    let data = await response.json();

    document.getElementById("street").textContent =
      data.address?.road || "Zona desconocida";
  } catch (e) {}
}

// =====================================
// LUGARES CERCANOS (throttle Overpass)
// =====================================

async function checkNearbyPOIs(lat, lon) {
  const now = Date.now();

  if (lastPOICoords) {
    const moved = haversineDistance(
      lastPOICoords.lat,
      lastPOICoords.lon,
      lat,
      lon,
    );

    const tooSoon = now - lastPOILookup < POI_LOOKUP_INTERVAL_MS;
    const tooClose = moved < POI_LOOKUP_MIN_DISTANCE_M;

    if (tooSoon && tooClose) return;
  }

  lastPOILookup = now;
  lastPOICoords = { lat, lon };

  try {
    const pois = await fetchNearbyPOIs(lat, lon, POI_NOTIFY_RADIUS_M);

    pois.forEach((poi) => {
      if (notifiedPOIIds.has(poi.id)) return;

      notifiedPOIIds.add(poi.id);

      showPOINotification(poi);
    });

    // evita que el Set crezca sin límite en viajes muy largos
    if (notifiedPOIIds.size > 300) notifiedPOIIds.clear();
  } catch (error) {
    console.warn("No se pudieron obtener lugares cercanos:", error);
  }
}

function showPOINotification(poi) {
  const container = document.getElementById("poi-notifications");

  if (!container) return;

  const toast = document.createElement("div");

  toast.className = "poi-toast";

  toast.innerHTML = `<span class="poi-icon">${poi.icon}</span><span class="poi-text">${poi.label}: ${escapeHtml(poi.name)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("poi-toast-out");

    setTimeout(() => toast.remove(), 400);
  }, 5000);
}

// evita inyección de HTML si el nombre del POI trae caracteres raros
function escapeHtml(text) {
  const div = document.createElement("div");

  div.textContent = text;

  return div.innerHTML;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;

  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatDistance(m) {
  if (m >= 1000) return (m / 1000).toFixed(1) + " km";

  return Math.round(m) + " m";
}
