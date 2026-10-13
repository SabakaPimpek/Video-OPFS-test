
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

// Zachowujemy adresy Blob URL, żeby nie tworzyć ich wielokrotnie.
const objectURLs = new Map();

// Zapobiega równoczesnemu ładowaniu tego samego filmu
// do tego samego odtwarzacza.
const loadingPromises = new WeakMap();

function getPlaylistFile(index) {
  const url = playlist[index];
  const fileInfo = videoFiles.find(item => item.url === url);

  if (!fileInfo) {
    throw new Error("Brak pliku w videoFiles: " + url);
  }

  return fileInfo;
}

async function getOPFSVideoURL(index) {
  if (objectURLs.has(index)) {
    return objectURLs.get(index);
  }

  const fileInfo = getPlaylistFile(index);
  const file = await getVideoFromOPFS(fileInfo);

  const localURL = URL.createObjectURL(file);
  objectURLs.set(index, localURL);

  console.log(
    "Źródło OPFS:",
    file.name,
    (file.size / 1024 / 1024).toFixed(2) + " MiB"
  );

  return localURL;
}

async function loadVideo(video, index) {
  if (
    Number(video.dataset.playlistIndex) === index &&
    video.readyState >= 3
  ) {
    return;
  }

  const existingPromise = loadingPromises.get(video);

  if (existingPromise) {
    await existingPromise;

    if (
      Number(video.dataset.playlistIndex) === index &&
      video.readyState >= 3
    ) {
      return;
    }
  }

  const promise = (async () => {
    video.pause();

    const localURL = await getOPFSVideoURL(index);

    // Jeśli ten film jest już ustawiony i gotowy, nie przeładowuj go.
    if (
      video.src === localURL &&
      Number(video.dataset.playlistIndex) === index &&
      video.readyState >= 3
    ) {
      return;
    }

    await new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        video.removeEventListener("canplay", onReady);
        video.removeEventListener("error", onError);
      };

      const finish = callback => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };

      const onReady = () => {
        video.dataset.playlistIndex = String(index);
        finish(resolve);
      };

      const onError = () => {
        finish(() => reject(
          new Error("Błąd ładowania filmu: " + playlist[index])
        ));
      };

      video.addEventListener("canplay", onReady);
      video.addEventListener("error", onError);

      video.src = localURL;
      video.load();

      if (video.readyState >= 3) {
        onReady();
      }
    });
  })();

  loadingPromises.set(video, promise);

  try {
    await promise;
  } finally {
    if (loadingPromises.get(video) === promise) {
      loadingPromises.delete(video);
    }
  }
}

async function prepareNext() {
  const nextIndex = (currentIndex + 1) % playlist.length;

  try {
    await loadVideo(idle, nextIndex);
    console.log("Gotowy z OPFS:", playlist[nextIndex]);
  } catch (err) {
    console.error("Błąd przygotowania następnego filmu:", err);
  }
}

function waitForFrame(video) {
  if (typeof video.requestVideoFrameCallback === "function") {
    return new Promise(resolve => {
      video.requestVideoFrameCallback(() => resolve());
    });
  }

  // Starsze przeglądarki: canplay zapewnia gotowość,
  // ale nie gwarantuje dokładnego momentu wyświetlenia klatki.
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
    // Film jest pobierany z OPFS lub odczytywany z pamięci URL.
    await loadVideo(nextPlayer, nextIndex);

    nextPlayer.currentTime = 0;

    // Rejestrujemy oczekiwanie przed rozpoczęciem odtwarzania.
    const framePromise = waitForFrame(nextPlayer);

    await nextPlayer.play();
    await framePromise;

    if (active !== oldPlayer || idle !== nextPlayer) {
      return;
    }

    nextPlayer.classList.add("active");
    oldPlayer.classList.remove("active");

    oldPlayer.pause();

    active = nextPlayer;
    idle = oldPlayer;
    currentIndex = nextIndex;

    active.addEventListener("ended", switchVideo);

    console.log(
      "Odtwarzany z OPFS:",
      playlist[currentIndex],
      "czas:",
      active.currentTime,
      "/",
      active.duration
    );

    // Przygotuj kolejny film w nieaktywnym odtwarzaczu.
    void prepareNext();

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

    void prepareNext();

    console.log("Start z OPFS:", playlist[currentIndex]);

  } catch (err) {
    console.error("Błąd uruchomienia:", err);
  }
}

window.addEventListener("click", initPlayer);
