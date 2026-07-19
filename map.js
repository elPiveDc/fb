// =====================================
// VARIABLES DEL MAPA
// =====================================

let map;

let userMarker = null;

let destinationMarker = null;

let routeLayer = null;

let currentLocation = null;

let destination = null;

// =====================================
// INICIALIZAR MAPA
// =====================================

function initMap(lat, lon) {
  map = L.map("map", {
    zoomControl: true,

    attributionControl: true,
  });

  // Estilo oscuro moderno

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",

    {
      maxZoom: 20,

      attribution: "&copy; OpenStreetMap &copy; CARTO",
    },
  ).addTo(map);

  map.setView(
    [lat, lon],

    18,
  );

  updateUserMarker(
    lat,

    lon,
  );

  // Seleccionar destino

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
          title: "Destino",
        },
      )

        .addTo(map);

      calculateRoute();
    },
  );
}

// =====================================
// ACTUALIZAR POSICION USUARIO
// =====================================

function updateUserLocation(lat, lon) {
  currentLocation = {
    lat: lat,

    lon: lon,
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

  if (destination) {
    calculateRoute();
  }
}

function updateUserMarker(lat, lon) {
  let position = [lat, lon];

  if (!userMarker) {
    userMarker = L.marker(
      position,

      {
        title: "Tu ubicación",
      },
    )

      .addTo(map);
  } else {
    userMarker.setLatLng(position);
  }
}

// =====================================
// CALCULAR RUTA CON OSRM
// =====================================

async function calculateRoute() {
  if (!currentLocation || !destination) {
    return;
  }

  const start = `${currentLocation.lon},${currentLocation.lat}`;

  const end = `${destination.lng},${destination.lat}`;

  const url = `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&steps=true&geometries=geojson`;

  try {
    const response = await fetch(url);

    const data = await response.json();

    if (data.routes.length === 0) {
      return;
    }

    const route = data.routes[0];

    drawRoute(route.geometry);

    updateNavigationInfo(route);
  } catch (error) {
    console.error(
      "Error OSRM",

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

  const coordinates = geometry.coordinates.map((point) => [point[1], point[0]]);

  routeLayer = L.polyline(
    coordinates,

    {
      color: "#00ffff",

      weight: 5,

      opacity: 0.9,
    },
  )

    .addTo(map);

  map.fitBounds(
    routeLayer.getBounds(),

    {
      padding: [30, 30],
    },
  );
}

// =====================================
// INFORMACION NAVEGACION
// =====================================

function updateNavigationInfo(route) {
  const meters = route.distance;

  const seconds = route.duration;

  const distanceText =
    meters > 1000
      ? (meters / 1000).toFixed(1) + " km"
      : meters.toFixed(0) + " m";

  const eta = Math.ceil(seconds / 60) + " min";

  document.getElementById("distance").textContent = distanceText;

  document.getElementById("eta").textContent = eta;

  let instruction = "Continúe recto";

  if (route.legs && route.legs[0].steps.length) {
    let step = route.legs[0].steps[0];

    let modifier = step.maneuver.modifier;

    if (modifier) {
      instruction = modifier.toUpperCase();
    }
  }

  document.getElementById("instruction").textContent = instruction;
}
