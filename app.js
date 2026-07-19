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
let cameraStream = null;

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
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
      },

      audio: false,
    });

    video.srcObject = cameraStream;
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

      // el usuario debe enterarse si el GPS falla, no solo la consola
      if (error.code === error.PERMISSION_DENIED) {
        alert("Se necesita permiso de ubicación para navegar");
      }
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

  // antes: "coords.altitude ? ..." fallaba con altitud real = 0 (nivel del mar)
  altLabel.textContent =
    coords.altitude !== null && coords.altitude !== undefined
      ? coords.altitude.toFixed(1) + " m"
      : "---";

  accLabel.textContent = coords.accuracy.toFixed(1) + " m";

  // antes: "coords.speed ? ..." fallaba con velocidad real = 0 (detenido)
  speedLabel.textContent =
    coords.speed !== null && coords.speed !== undefined
      ? (coords.speed * 3.6).toFixed(1) + " km/h"
      : "0 km/h";
}

// =====================================
// BRUJULA
// =====================================

function startCompass() {
  // iOS Safari exige permiso explícito para deviceorientation
  if (typeof DeviceOrientationEvent?.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        if (state === "granted") {
          attachCompassListener();
        } else {
          console.warn("Permiso de brújula denegado");
        }
      })
      .catch((error) => console.error("Error permiso brújula:", error));
  } else {
    // Android / navegadores que no requieren permiso explícito
    attachCompassListener();
  }
}

function attachCompassListener() {
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
