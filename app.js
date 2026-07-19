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
let compassActive = false;

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

      if (error.code === error.PERMISSION_DENIED) {
        alert("Se necesita permiso de ubicación para navegar");
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        alert("No se pudo determinar tu ubicación. Verifica tu señal GPS");
      } else if (error.code === error.TIMEOUT) {
        console.warn("GPS tardó demasiado en responder, reintentando...");
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

  altLabel.textContent =
    coords.altitude !== null && coords.altitude !== undefined
      ? coords.altitude.toFixed(1) + " m"
      : "---";

  accLabel.textContent = coords.accuracy.toFixed(1) + " m";

  speedLabel.textContent =
    coords.speed !== null && coords.speed !== undefined
      ? (coords.speed * 3.6).toFixed(1) + " km/h"
      : "0 km/h";
}

// =====================================
// BRUJULA
// =====================================
// iOS Safari exige que el permiso de orientación se pida dentro
// de un gesto directo del usuario (tap/click). Si se llama
// automáticamente al cargar la página, el navegador lo rechaza
// sin avisar. Por eso: en iOS mostramos un botón visible y solo
// pedimos el permiso cuando el usuario lo toca. En Android/otros
// navegadores que no requieren este permiso, se activa directo.

function startCompass() {
  const needsPermission =
    typeof DeviceOrientationEvent?.requestPermission === "function";

  if (!needsPermission) {
    attachCompassListener();

    return;
  }

  const btn = document.getElementById("compass-permission-btn");

  if (!btn) {
    // si no existe el botón en el HTML, intentamos igual (puede
    // fallar en iOS por falta de gesto, pero no rompe nada)
    requestCompassPermission();

    return;
  }

  btn.style.display = "flex";

  btn.onclick = () => {
    requestCompassPermission();
  };
}

function requestCompassPermission() {
  DeviceOrientationEvent.requestPermission()
    .then((state) => {
      const btn = document.getElementById("compass-permission-btn");

      if (state === "granted") {
        attachCompassListener();

        if (btn) btn.style.display = "none";
      } else {
        console.warn("Permiso de brújula denegado");

        if (btn) btn.textContent = "Brújula no disponible";
      }
    })
    .catch((error) => console.error("Error permiso brújula:", error));
}

function attachCompassListener() {
  if (compassActive) return;

  compassActive = true;

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

  if (typeof renderArrow === "function") renderArrow();

  if (typeof renderARPOIs === "function") renderARPOIs();
}

// =====================================
// INICIO
// =====================================

startCamera();

startGPS();

startCompass();
