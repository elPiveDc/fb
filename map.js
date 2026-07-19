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

let darkMode = true;

let darkLayer = null;

let lightLayer = null;

let lastRouteUpdate = 0;

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

  html: `

        <div style="
            font-size:32px;">
            ⭐
        </div>

    `,

  iconSize: [32, 32],

  iconAnchor: [16, 16],
});

// =====================================
// INICIALIZAR MAPA
// =====================================

function initMap(lat, lon) {
  map = L.map("map", {
    zoomControl: false,

    attributionControl: true,
  });

  darkLayer = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",

    {
      maxZoom: 20,

      attribution: "&copy; OpenStreetMap &copy; CARTO",
    },
  );

  lightLayer = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",

    {
      maxZoom: 20,

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

    function (e) {
      destination = e.latlng;

      if (destinationMarker) {
        map.removeLayer(destinationMarker);
      }

      destinationMarker = L.marker(
        destination,

        {
          icon: destinationIcon,

          title: "Destino",
        },
      )

        .addTo(map);

      calculateRoute();
    },
  );

  setupMapButtons();
}

// =====================================
// BOTONES MAPA
// =====================================

function setupMapButtons() {
  const sizeButton = document.getElementById("map-size-btn");

  const themeButton = document.getElementById("map-theme-btn");

  sizeButton.onclick = function () {
    const container = document.getElementById("map-container");

    container.classList.toggle("expanded");

    setTimeout(() => {
      map.invalidateSize();
    }, 350);
  };

  themeButton.onclick = function () {
    if (darkMode) {
      map.removeLayer(darkLayer);

      lightLayer.addTo(map);

      themeButton.textContent = "☀️";
    } else {
      map.removeLayer(lightLayer);

      darkLayer.addTo(map);

      themeButton.textContent = "🌙";
    }

    darkMode = !darkMode;
  };
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

  const now = Date.now();

  if (destination && now - lastRouteUpdate > 10000) {
    calculateRoute();

    lastRouteUpdate = now;
  }
}

function updateUserMarker(lat, lon) {
  const position = [lat, lon];

  if (!userMarker) {
    userMarker = L.marker(
      position,

      {
        icon: userIcon,

        title: "Tu ubicación",
      },
    )

      .addTo(map);
  } else {
    userMarker.setLatLng(position);
  }
}

// =====================================
// OSRM
// =====================================

async function calculateRoute() {
  if (!currentLocation || !destination) return;

  const start = `${currentLocation.lon},${currentLocation.lat}`;

  const end = `${destination.lng},${destination.lat}`;

  const url = `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&steps=true&geometries=geojson`;

  try {
    const response = await fetch(url);

    const data = await response.json();

    if (!data.routes.length) return;

    currentRoute = data.routes[0];

    drawRoute(currentRoute.geometry);

    updateNavigationInfo();
  } catch (error) {
    console.error(
      "OSRM",

      error,
    );
  }
}

// =====================================
// DIBUJAR RUTA
// =====================================

function drawRoute(geometry) {
  if (routeLayer) {
    map.removeLayer(routeLayer);
  }

  const coords = geometry.coordinates.map((point) => [point[1], point[0]]);

  routeLayer = L.polyline(
    coords,

    {
      color: "#00ffff",

      weight: 6,

      opacity: 0.9,
    },
  )

    .addTo(map);
}

// =====================================
// DATOS NAVEGACION
// =====================================

function updateNavigationInfo() {
  if (!currentRoute) return;

  document.getElementById("distance").textContent = formatDistance(
    currentRoute.distance,
  );

  document.getElementById("eta").textContent =
    Math.ceil(currentRoute.duration / 60) + " min";
}

function formatDistance(meters) {
  if (meters >= 1000) return (meters / 1000).toFixed(1) + " km";

  return Math.round(meters) + " m";
}

// =====================================
// CALLE ACTUAL
// =====================================

async function updateStreet(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;

    const response = await fetch(url);

    const data = await response.json();

    const street =
      data.address.road || data.address.pedestrian || "Zona desconocida";

    document.getElementById("street").textContent = street;
  } catch (error) {
    console.error(
      "Street error",

      error,
    );
  }
}
