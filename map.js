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

  try {
    let route = await calculateRouteByMode(
      currentLocation,

      destination,

      navigationMode,
    );

    currentRoute = route;

    navigationSteps = route.steps || [];

    drawRoute(route.geometry);

    updateNavigationInfo(route);
  } catch (error) {
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
// MODO
// =====================================

function updateRouteModeLabel() {
  const label = document.getElementById("route-mode");

  if (!label) return;

  label.textContent =
    navigationMode === "walking" ? "🚶 Caminando" : "🚗 Vehículo";
}

// =====================================
// CALLE ACTUAL
// =====================================

async function updateStreet(lat, lon) {
  try {
    let response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
    );

    let data = await response.json();

    document.getElementById("street").textContent =
      data.address.road || "Zona desconocida";
  } catch (e) {}
}

function formatDistance(m) {
  if (m >= 1000) return (m / 1000).toFixed(1) + " km";

  return Math.round(m) + " m";
}
