const playlist = [
  "video/CityHall_3840x2160_4k.mp4",
  "video/output_h264_4k.mp4",
  "video/TheaterSquare_3840x2160_4k.mp4"
];

let currentIndex = 0;
let switching = false;
let started = false;

let active = document.getElementById("playerA");
let idle = document.getElementById("playerB");

function loadVideo(video, index) {
  if (
    Number(video.dataset.playlistIndex) === index &&
    video.readyState >= 3
  ) {
    return Promise.resolve();
  }

  video.pause();
  video.dataset.playlistIndex = String(index);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    };

    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Błąd filmu: " + playlist[index]));
    };

    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);

    video.src = playlist[index];
    video.load();

    if (video.readyState >= 3) {
      cleanup();
      resolve();
    }
  });
}

async function prepareNext() {
  const nextIndex = (currentIndex + 1) % playlist.length;

  try {
    await loadVideo(idle, nextIndex);
    console.log("Gotowy:", playlist[nextIndex]);
  } catch (err) {
    console.error(err);
  }
}

function waitForFrame(video) {
  if (typeof video.requestVideoFrameCallback === "function") {
    return new Promise(resolve => {
      video.requestVideoFrameCallback(() => resolve());
    });
  }

  return Promise.resolve();
}

async function switchVideo(event) {
  if (switching || !started) return;
  if (event.currentTarget !== active) return;
  if (!active.ended) return;

  switching = true;

  const oldPlayer = active;
  const nextPlayer = idle;
  const nextIndex = (currentIndex + 1) % playlist.length;

  oldPlayer.removeEventListener("ended", switchVideo);

  try {
    await loadVideo(nextPlayer, nextIndex);

    await loadVideo(nextPlayer, nextIndex);

nextPlayer.currentTime = 0;

// Zarejestruj oczekiwanie na klatkę przed rozpoczęciem odtwarzania.
const firstFrame = typeof nextPlayer.requestVideoFrameCallback === "function"
  ? new Promise(resolve => {
      nextPlayer.requestVideoFrameCallback(() => resolve());
    })
  : Promise.resolve();

await nextPlayer.play();
await firstFrame;
    // Poczekaj, aż przeglądarka zgłosi nową klatkę.
    if (typeof nextPlayer.requestVideoFrameCallback === "function") {
      await new Promise(resolve => {
        nextPlayer.requestVideoFrameCallback(() => resolve());
      });
    }

    // Upewnij się, że role nie zmieniły się w międzyczasie.
    if (active !== oldPlayer || idle !== nextPlayer) return;

    nextPlayer.classList.add("active");
    oldPlayer.classList.remove("active");

    oldPlayer.pause();

    active = nextPlayer;
    idle = oldPlayer;
    currentIndex = nextIndex;

    active.addEventListener("ended", switchVideo);

    console.log(
      "Odtwarzany:",
      playlist[currentIndex],
      "czas:",
      active.currentTime,
      "/",
      active.duration
    );

    // Następny plik ładujemy na nieaktywnym playerze.
    prepareNext();

  } catch (err) {
    console.error("Błąd przełączania:", err);

    if (active === oldPlayer) {
      active.addEventListener("ended", switchVideo);
    }
  } finally {
    switching = false;
  }
}

async function initPlayer() {
  if (started) return;

  try {
    await loadVideo(active, 0);

    active.classList.add("active");
    idle.classList.remove("active");

    await active.play();

    started = true;
    currentIndex = 0;

    active.addEventListener("ended", switchVideo);

    prepareNext();

    console.log("Start:", playlist[currentIndex]);

  } catch (err) {
    console.error("Błąd uruchomienia:", err);
  }
}

window.addEventListener("click", initPlayer);