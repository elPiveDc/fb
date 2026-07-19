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
let navigationMode = "walking";
let routeRequestId = 0;
let lastStreetLookup = 0;
let lastStreetCoords = null;
const STREET_LOOKUP_INTERVAL_MS = 3000;
const STREET_LOOKUP_MIN_DISTANCE_M = 15;
let targetBearing = 0;

// throttle Overpass (POIs cercanos)
let lastPOILookup = 0;
let lastPOICoords = null;
const POI_LOOKUP_INTERVAL_MS = 20000;
const POI_LOOKUP_MIN_DISTANCE_M = 40;
const POI_NOTIFY_RADIUS_M = 120;
const POI_REMOVE_RADIUS_M = POI_NOTIFY_RADIUS_M * 1.3;
const AR_FOV_HALF_DEG = 45;

// POIs actualmente rastreados: id -> {lat, lon, name, icon, label, el, verticalSlot}
const activePOIs = new Map();

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

  map.setView([lat, lon], 17);

  updateUserMarker(lat, lon);

  setTimeout(() => {
    map.invalidateSize();
  }, 500);

  map.on("click", (e) => {
    setDestination(e.latlng.lat, e.latlng.lng);
  });

  setupMapButtons();

  setupSearch();
}

// =====================================
// DESTINO (compartido entre click en mapa y buscador)
// =====================================

function setDestination(lat, lon, options = {}) {
  destination = { lat, lon };

  if (destinationMarker) map.removeLayer(destinationMarker);

  destinationMarker = L.marker([lat, lon], {
    icon: destinationIcon,
  }).addTo(map);

  if (options.recenter) {
    map.setView([lat, lon], 16);
  }

  calculateRoute();
}

// =====================================
// BOTONES
// =====================================

function setupMapButtons() {
  const sizeBtn = document.getElementById("map-size-btn");

  sizeBtn.onclick = () => {
    document.getElementById("map-container").classList.toggle("expanded");

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
// BUSCADOR DE DESTINO
// =====================================

function setupSearch() {
  const input = document.getElementById("search-input");
  const btn = document.getElementById("search-btn");
  const resultsBox = document.getElementById("search-results");

  if (!input || !btn || !resultsBox) return;

  const runSearch = async () => {
    const query = input.value.trim();

    if (!query) return;

    resultsBox.classList.add("visible");
    resultsBox.innerHTML = `<div class="search-result-item search-loading">Buscando...</div>`;

    try {
      const results = await searchPlace(query);

      if (!results.length) {
        resultsBox.innerHTML = `<div class="search-result-item">Sin resultados</div>`;

        return;
      }

      resultsBox.innerHTML = "";

      results.forEach((place) => {
        const item = document.createElement("div");

        item.className = "search-result-item";
        item.textContent = place.name;

        item.onclick = () => {
          setDestination(place.lat, place.lon, { recenter: true });

          resultsBox.classList.remove("visible");
          resultsBox.innerHTML = "";
          input.value = place.name;
          input.blur();
        };

        resultsBox.appendChild(item);
      });
    } catch (error) {
      console.error("Error de búsqueda:", error);

      resultsBox.innerHTML = `<div class="search-result-item">Error al buscar</div>`;
    }
  };

  btn.onclick = runSearch;

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch();
  });
}

// =====================================
// UBICACION
// =====================================

function updateUserLocation(lat, lon) {
  currentLocation = { lat, lon };

  updateStreet(lat, lon);

  checkNearbyPOIs(lat, lon);

  if (!map) {
    initMap(lat, lon);

    return;
  }

  updateUserMarker(lat, lon);

  updateTargetBearing();
}

function updateUserMarker(lat, lon) {
  let position = [lat, lon];

  if (!userMarker) {
    userMarker = L.marker(position, {
      icon: userIcon,
    }).addTo(map);
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

    console.error("Routing error", error);

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

  routeLayer = L.polyline(coords, {
    color: "#00ffff",
    weight: 6,
    opacity: 0.9,
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds(), {
    padding: [40, 40],
  });
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

  if (step.instruction) return step.instruction;

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

function updateTargetBearing() {
  if (!currentLocation) return;

  let target = destination;

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

  const relative = (((targetBearing - currentHeading) % 360) + 360) % 360;

  arrowEl.style.transform = `rotate(${relative}deg)`;
}

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
// LUGARES CERCANOS (Overpass + capa AR)
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

    if (tooSoon && tooClose) {
      // no re-consultamos Overpass, pero sí reposicionamos los
      // marcadores AR ya conocidos (cambió posición/heading)
      renderARPOIs();

      return;
    }
  }

  lastPOILookup = now;
  lastPOICoords = { lat, lon };

  try {
    const pois = await fetchNearbyPOIs(lat, lon, POI_NOTIFY_RADIUS_M);

    pois.forEach((poi) => {
      if (!activePOIs.has(poi.id)) {
        activePOIs.set(poi.id, {
          ...poi,
          verticalSlot: verticalSlotFor(poi.id),
          el: null,
        });
      }
    });

    renderARPOIs();
  } catch (error) {
    console.warn("No se pudieron obtener lugares cercanos:", error);
  }
}

// posiciona verticalmente cada POI dentro de una franja fija, para
// que dos POIs con rumbo similar no queden exactamente superpuestos
function verticalSlotFor(id) {
  const band = [26, 55]; // % desde arriba del camera-container

  const pseudo = Math.abs(Math.sin(id) * 10000) % 1;

  return band[0] + pseudo * (band[1] - band[0]);
}

// =====================================
// CAPA AR SOBRE LA CAMARA
// =====================================

function renderARPOIs() {
  if (!currentLocation) return;

  const layer = document.getElementById("ar-poi-layer");

  if (!layer) return;

  activePOIs.forEach((poi) => {
    const distance = haversineDistance(
      currentLocation.lat,
      currentLocation.lon,
      poi.lat,
      poi.lon,
    );

    poi.distance = distance;

    // el usuario se alejó demasiado: dejamos de rastrear este POI
    if (distance > POI_REMOVE_RADIUS_M) {
      if (poi.el) poi.el.remove();

      activePOIs.delete(poi.id);

      return;
    }

    if (!poi.el) {
      poi.el = createPOIElement(poi);

      layer.appendChild(poi.el);
    }

    const bearing = calculateBearing(
      currentLocation.lat,
      currentLocation.lon,
      poi.lat,
      poi.lon,
    );

    // diferencia angular entre hacia dónde miro y hacia dónde está el POI
    const relative = ((bearing - currentHeading + 540) % 360) - 180;

    // fuera del campo visual asumido de la cámara: se oculta (no se borra)
    if (Math.abs(relative) > AR_FOV_HALF_DEG) {
      poi.el.style.display = "none";

      return;
    }

    poi.el.style.display = "flex";

    const leftPercent = 50 + (relative / AR_FOV_HALF_DEG) * 50;

    // más cerca = ícono más grande y opaco (simula profundidad)
    const proximity = 1 - Math.min(distance / POI_NOTIFY_RADIUS_M, 1);
    const scale = 0.7 + proximity * 0.5;
    const opacity = 0.55 + proximity * 0.45;

    poi.el.style.left = `${leftPercent}%`;
    poi.el.style.top = `${poi.verticalSlot}%`;
    poi.el.style.opacity = opacity;
    poi.el.style.transform = `translate(-50%, -50%) scale(${scale})`;

    const distText = poi.el.querySelector(".ar-poi-distance");

    if (distText) distText.textContent = formatDistance(distance);
  });
}

function createPOIElement(poi) {
  const el = document.createElement("div");

  el.className = "ar-poi-marker";

  el.innerHTML = `
    <div class="ar-poi-icon">${poi.icon}</div>
    <div class="ar-poi-name">${escapeHtml(poi.name)}</div>
    <div class="ar-poi-distance"></div>
  `;

  return el;
}

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
