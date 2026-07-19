// =====================================
// ELEMENTOS HTML
// =====================================

const video = document.getElementById("camera");

const timeLabel = document.getElementById("time");

const latLabel = document.getElementById("latitude");
const lonLabel = document.getElementById("longitude");
const altLabel = document.getElementById("altitude");
const accLabel = document.getElementById("accuracy");
const speedLabel = document.getElementById("speed");

const compass = document.getElementById("compass");
const headingLabel = document.getElementById("heading");

// =====================================
// VARIABLES
// =====================================

let currentHeading = 0;

// =====================================
// RELOJ
// =====================================

function updateClock() {
  const now = new Date();

  timeLabel.textContent = now.toLocaleTimeString();
}

setInterval(updateClock, 1000);

updateClock();

// =====================================
// CAMARA
// =====================================

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
      },

      audio: false,
    });

    video.srcObject = stream;
  } catch (error) {
    console.error("Error cámara:", error);

    alert("No se pudo acceder a la cámara");
  }
}

// =====================================
// GPS
// =====================================

function startGPS() {
  if (!navigator.geolocation) {
    alert("GPS no disponible");

    return;
  }

  navigator.geolocation.watchPosition(
    (position) => {
      const data = position.coords;

      updateGPSInfo(data);

      // Enviar al mapa

      updateUserLocation(
        data.latitude,

        data.longitude,
      );
    },

    (error) => {
      console.error(
        "GPS Error",

        error,
      );
    },

    {
      enableHighAccuracy: true,

      maximumAge: 1000,

      timeout: 5000,
    },
  );
}

function updateGPSInfo(coords) {
  latLabel.textContent = coords.latitude.toFixed(6);

  lonLabel.textContent = coords.longitude.toFixed(6);

  altLabel.textContent = coords.altitude
    ? coords.altitude.toFixed(1) + " m"
    : "---";

  accLabel.textContent = coords.accuracy.toFixed(1) + " m";

  if (coords.speed) {
    speedLabel.textContent = (coords.speed * 3.6).toFixed(1) + " km/h";
  } else {
    speedLabel.textContent = "0 km/h";
  }
}

// =====================================
// BRUJULA
// =====================================

function startCompass() {
  window.addEventListener(
    "deviceorientation",

    (event) => {
      let heading;

      // Android / Chrome

      if (event.webkitCompassHeading) {
        heading = event.webkitCompassHeading;
      } else if (event.alpha !== null) {
        heading = 360 - event.alpha;
      }

      if (heading === undefined) return;

      currentHeading = heading;

      updateCompass(heading);
    },
  );
}

function updateCompass(value) {
  headingLabel.textContent = Math.round(value) + "°";

  compass.style.transform = `rotate(${-value}deg)`;
}

// =====================================
// INICIO
// =====================================

startCamera();

startGPS();

startCompass();
