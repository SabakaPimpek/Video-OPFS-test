let currentIndex = 0;
let switching = false;
let started = false;
let starting = false;

let active = document.getElementById("playerA");
let idle = document.getElementById("playerB");

// Blob URL-e po nazwie pliku, żeby nie tworzyć ich wielokrotnie.
const objectURLs = new Map();

// Zapobiega równoczesnemu ładowaniu tego samego filmu
// do tego samego odtwarzacza.
const loadingPromises = new WeakMap();

function playlist() {
  return getSyncedPlaylist();
}

function getPlaylistFile(index) {
  const fileInfo = playlist()[index];

  if (!fileInfo) {
    throw new Error("Brak pliku w playliście pod indeksem: " + index);
  }

  return fileInfo;
}

function markPlayerVideo(video, index, name) {
  video.dataset.playlistIndex = String(index);
  video.dataset.videoName = name;
}

function isPlayerReadyFor(video, fileInfo, index) {
  return (
    video.dataset.videoName === fileInfo.name &&
    Number(video.dataset.playlistIndex) === index &&
    video.readyState >= 3
  );
}

function revokeObjectURL(name) {
  const cached = objectURLs.get(name);

  if (!cached) {
    return;
  }

  URL.revokeObjectURL(cached.url);
  objectURLs.delete(name);
}

function pruneObjectURLs(wantedNames) {
  for (const name of [...objectURLs.keys()]) {
    if (!wantedNames.has(name)) {
      revokeObjectURL(name);
    }
  }
}

async function getStoredVideoURL(fileInfo) {
  const file = await getLocalVideoFile(fileInfo);

  if (!file) {
    throw new Error("Film nie jest jeszcze zapisany lokalnie: " + fileInfo.name);
  }

  const cached = objectURLs.get(fileInfo.name);

  if (cached && cached.size === file.size) {
    return cached.url;
  }

  if (cached) {
    URL.revokeObjectURL(cached.url);
  }

  const localURL = URL.createObjectURL(file);
  objectURLs.set(fileInfo.name, { url: localURL, size: file.size });

  console.log(
    "Źródło lokalne:",
    file.name,
    (file.size / 1024 / 1024).toFixed(2) + " MiB"
  );

  return localURL;
}

async function loadVideo(video, index) {
  const fileInfo = getPlaylistFile(index);

  if (isPlayerReadyFor(video, fileInfo, index)) {
    return;
  }

  const existingPromise = loadingPromises.get(video);

  if (existingPromise) {
    await existingPromise;

    if (isPlayerReadyFor(video, fileInfo, index)) {
      return;
    }
  }

  const promise = (async () => {
    video.pause();

    const localURL = await getStoredVideoURL(fileInfo);

    if (
      video.src === localURL &&
      video.dataset.videoName === fileInfo.name &&
      video.readyState >= 3
    ) {
      markPlayerVideo(video, index, fileInfo.name);
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
        markPlayerVideo(video, index, fileInfo.name);
        finish(resolve);
      };

      const onError = () => {
        finish(() => reject(
          new Error("Błąd ładowania filmu: " + fileInfo.name)
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
  const items = playlist();

  if (items.length < 2) {
    return;
  }

  const nextIndex = (currentIndex + 1) % items.length;

  try {
    await loadVideo(idle, nextIndex);
    console.log("Gotowy lokalnie:", items[nextIndex].name);
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

  return Promise.resolve();
}

async function replayActive() {
  active.currentTime = 0;
  await active.play();
}

async function switchVideo(event) {
  if (switching || !started) return;
  if (event.currentTarget !== active) return;
  if (!active.ended) return;

  switching = true;

  const oldPlayer = active;
  const nextPlayer = idle;
  const items = playlist();

  oldPlayer.removeEventListener("ended", switchVideo);

  try {
    if (!items.length) {
      started = false;
      return;
    }

    if (items.length === 1) {
      await replayActive();
      active.addEventListener("ended", switchVideo);
      return;
    }

    const nextIndex = (currentIndex + 1) % items.length;

    await loadVideo(nextPlayer, nextIndex);

    nextPlayer.currentTime = 0;

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
      "Odtwarzany lokalnie:",
      playlist()[currentIndex].name,
      "czas:",
      active.currentTime,
      "/",
      active.duration
    );

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

function stopPlayback() {
  started = false;
  starting = false;
  switching = false;
  currentIndex = 0;
  active.removeEventListener("ended", switchVideo);
  active.pause();
  idle.pause();
}

async function initPlayer() {
  if (started || starting) return;
  starting = true;

  try {
    if (!playlist().length) {
      await syncPlaylistOnce();
    }

    const items = playlist();

    if (!items.length) {
      throw new Error("Brak filmów w playliście.");
    }

    if (currentIndex >= items.length) {
      currentIndex = 0;
    }

    await loadVideo(active, currentIndex);

    active.classList.add("active");
    idle.classList.remove("active");

    await active.play();

    started = true;
    active.addEventListener("ended", switchVideo);

    void prepareNext();

    console.log("Start lokalny:", items[currentIndex].name);
  } catch (err) {
    if (err?.name === "NotAllowedError") {
      console.warn("Autoplay zablokowany — kliknięcie uruchomi odtwarzanie.");
    } else {
      console.error("Błąd uruchomienia:", err);
    }
  } finally {
    starting = false;
  }
}

function tryStartPlayer() {
  if (started || starting) return;
  if (!playlist().length) return;
  void initPlayer();
}

function onPlaylistUpdated() {
  const items = playlist();
  pruneObjectURLs(new Set(items.map(item => item.name)));

  if (!items.length) {
    stopPlayback();
    return;
  }

  const currentName = active.dataset.videoName;
  const foundIndex = currentName
    ? items.findIndex(item => item.name === currentName)
    : -1;

  currentIndex = foundIndex >= 0 ? foundIndex : 0;

  if (!started) {
    tryStartPlayer();
    return;
  }

  if (foundIndex < 0) {
    void (async () => {
      try {
        await loadVideo(active, 0);
        active.currentTime = 0;
        await active.play();
        void prepareNext();
      } catch (err) {
        console.error("Błąd po zmianie playlisty:", err);
      }
    })();
    return;
  }

  void prepareNext();
}

window.addEventListener("signage-playlist-updated", onPlaylistUpdated);
window.addEventListener("signage-playlist-pruned", event => {
  for (const name of event.detail?.removed ?? []) {
    revokeObjectURL(name);
  }
});
window.addEventListener("click", initPlayer);

tryStartPlayer();
