// =====================================
// ROUTING MANAGER
// =====================================

const ORS_API_KEY = "TU_API_KEY";

async function calculateRouteByMode(start, end, mode) {
  if (mode === "walking") {
    return await calculateWalkingRoute(start, end);
  } else {
    return await calculateDrivingRoute(start, end);
  }
}

// =====================================
// VEHICULO
// =====================================

async function calculateDrivingRoute(start, end) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&steps=true&geometries=geojson`;

  const response = await fetch(url);

  const data = await response.json();

  return data.routes[0];
}

// =====================================
// PEATON
// =====================================

async function calculateWalkingRoute(start, end) {
  const url =
    "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";

  const response = await fetch(
    url,

    {
      method: "POST",

      headers: {
        Authorization: ORS_API_KEY,

        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        coordinates: [
          [start.lon, start.lat],

          [end.lon, end.lat],
        ],
      }),
    },
  );

  const data = await response.json();

  return convertORSRoute(data);
}

// =====================================
// ADAPTADOR ORS -> FORMATO COMUN
// =====================================

function convertORSRoute(data) {
  return {
    distance: data.features[0].properties.summary.distance,

    duration: data.features[0].properties.summary.duration,

    geometry: data.features[0].geometry,

    steps: data.features[0].properties.segments[0].steps,
  };
}
