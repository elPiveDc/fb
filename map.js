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
// CREAR MAPA
// =====================================

function initMap(lat, lon) {
  map = L.map("map", {
    zoomControl: false,

    attributionControl: true,
  });

  // MAPA OSCURO

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",

    {
      maxZoom: 20,

      attribution: "&copy; OpenStreetMap &copy; CARTO",
    },
  ).addTo(map);

  map.setView(
    [lat, lon],

    17,
  );

  updateUserMarker(
    lat,

    lon,
  );

  // arregla render móvil

  setTimeout(() => {
    map.invalidateSize();
  }, 500);

  map.on(
    "click",

    (e) => {
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
}

// =====================================
// POSICION USUARIO
// =====================================

function updateUserLocation(lat, lon) {
  currentLocation = {
    lat,

    lon,
  };

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

  // evitar llamadas excesivas OSRM

  const now = Date.now();

  if (destination && now - lastRouteUpdate > 10000) {
    calculateRoute();

    lastRouteUpdate = now;
  }
}

function updateUserMarker(lat, lon) {
  const pos = [lat, lon];

  if (!userMarker) {
    userMarker = L.marker(
      pos,

      {
        icon: userIcon,

        title: "Tu ubicación",
      },
    )

      .addTo(map);
  } else {
    userMarker.setLatLng(pos);
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

    navigationSteps = currentRoute.legs[0].steps;

    drawRoute(currentRoute.geometry);

    updateNavigationInfo();
  } catch (error) {
    console.error(
      "OSRM error",

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

  const points = geometry.coordinates.map((p) => [p[1], p[0]]);

  routeLayer = L.polyline(
    points,

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
// INFORMACION NAVEGACION
// =====================================

function updateNavigationInfo() {
  if (!currentRoute) return;

  const distance = currentRoute.distance;

  const duration = currentRoute.duration;

  document.getElementById("distance").textContent = formatDistance(distance);

  document.getElementById("eta").textContent =
    Math.ceil(duration / 60) + " min";

  if (navigationSteps.length) {
    const step = navigationSteps[0];

    const maneuver = step.maneuver;

    let text = "Continúe recto";

    if (maneuver.modifier) {
      text = maneuver.modifier

        .replace("_", " ")

        .toUpperCase();
    }

    document.getElementById("instruction").textContent = text;
  }
}

function formatDistance(meters) {
  if (meters > 1000) return (meters / 1000).toFixed(1) + " km";

  return Math.round(meters) + " m";
}
