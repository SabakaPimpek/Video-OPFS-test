// Jedna stała do podmiany na kiosku (lokalny plik lub zdalny URL).
const PLAYLIST_URL = "playlist.json";
const PLAYLIST_STORAGE_KEY = "signage-playlist";
const PLAYLIST_SYNC_INTERVAL_MS = 5 * 60 * 1000;

let syncedPlaylist = [];
let playlistSyncPromise = null;
let playlistSyncTimer = null;

function emitPlaylistEvent(type, detail) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

function getSyncedPlaylist() {
  return syncedPlaylist.slice();
}

function setSyncedPlaylist(videos) {
  syncedPlaylist = videos.slice();
  emitPlaylistEvent("signage-playlist-updated", {
    videos: getSyncedPlaylist()
  });
}

function isQuotaError(error) {
  return (
    error?.name === "QuotaExceededError" ||
    /quota|niedostateczn|storage/i.test(String(error?.message ?? ""))
  );
}

function normalizePlaylistVideo(entry, index) {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Nieprawidłowy wpis playlisty pod indeksem ${index}.`);
  }

  const name = String(entry.name || "").trim();
  const url = String(entry.url || "").trim();
  const id = String(entry.id || name).trim();

  if (!name || !url) {
    throw new Error(`Wpis playlisty ${index} wymaga pól name i url.`);
  }

  const video = { id, url, name };

  if (entry.size != null && entry.size !== "") {
    const size = Number(entry.size);

    if (!Number.isFinite(size) || size < 0) {
      throw new Error(`Wpis playlisty ${name} ma nieprawidłowe pole size.`);
    }

    video.size = size;
  }

  return video;
}

function parsePlaylistPayload(payload) {
  if (!payload || !Array.isArray(payload.videos)) {
    throw new Error("playlist.json musi zawierać tablicę videos.");
  }

  return payload.videos.map(normalizePlaylistVideo);
}

function readCachedPlaylist() {
  try {
    const raw = localStorage.getItem(PLAYLIST_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    return parsePlaylistPayload(JSON.parse(raw));
  } catch (error) {
    console.warn("Nie udało się odczytać zapisanej playlisty.", error);
    return null;
  }
}

function writeCachedPlaylist(payload) {
  try {
    localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Nie udało się zapisać playlisty w localStorage.", error);
  }
}

async function fetchRemotePlaylist() {
  const response = await fetch(PLAYLIST_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Nie udało się pobrać playlisty: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const videos = parsePlaylistPayload(payload);

  writeCachedPlaylist({
    version: payload.version ?? 1,
    updatedAt: payload.updatedAt ?? new Date().toISOString(),
    videos
  });

  return videos;
}

async function playlistFromLocalFiles(store) {
  const localItems = await store.list();

  return localItems
    .filter(item => item.size > 0)
    .map(item => ({
      id: item.name,
      name: item.name,
      url: item.name,
      size: item.size
    }));
}

async function resolvePlaylistVideos(store) {
  try {
    const videos = await fetchRemotePlaylist();
    console.log("Pobrano playlistę:", videos.length, "filmów");
    return { videos, fromNetwork: true };
  } catch (error) {
    console.warn("Brak sieci lub błąd playlisty, używam kopii lokalnej.", error);

    const cached = readCachedPlaylist();

    if (cached?.length) {
      return { videos: cached, fromNetwork: false };
    }

    const local = await playlistFromLocalFiles(store);

    if (local.length) {
      console.log("Playlista z plików już zapisanych lokalnie:", local.length);
      return { videos: local, fromNetwork: false };
    }

    throw error;
  }
}

async function removeVideosNotOnPlaylist(store, videos) {
  const wantedNames = new Set(videos.map(video => video.name));
  const localItems = await store.list();
  const removed = [];

  for (const item of localItems) {
    if (wantedNames.has(item.name)) {
      continue;
    }

    console.log("Usuwam film spoza playlisty:", item.name);
    await store.delete(item.name);
    removed.push(item.name);
  }

  if (removed.length) {
    emitPlaylistEvent("signage-playlist-pruned", { removed });
  }

  return removed;
}

async function downloadPlaylistVideos(videos, fromNetwork) {
  const ready = [];

  for (let index = 0; index < videos.length; index += 1) {
    const video = videos[index];

    emitPlaylistEvent("signage-playlist-progress", {
      index,
      total: videos.length,
      video,
      status: "checking"
    });

    try {
      const existing = await getLocalVideoFile(video);

      if (existing) {
        ready.push(video);
        if (ready.length > syncedPlaylist.length) {
          setSyncedPlaylist(ready);
        }
        emitPlaylistEvent("signage-playlist-progress", {
          index,
          total: videos.length,
          video,
          status: "local"
        });
        continue;
      }

      if (!fromNetwork) {
        console.warn("Offline: brak lokalnego pliku", video.name);
        continue;
      }

      await ensureVideo(video);
      ready.push(video);
      if (ready.length > syncedPlaylist.length) {
        setSyncedPlaylist(ready);
      }
      emitPlaylistEvent("signage-playlist-progress", {
        index,
        total: videos.length,
        video,
        status: "ready"
      });
    } catch (error) {
      const message = isQuotaError(error)
        ? `Brak miejsca na dysku przy zapisie ${video.name}.`
        : error.message;

      console.error("Nie udało się zsynchronizować filmu:", video.name, message);
      emitPlaylistEvent("signage-playlist-error", {
        video,
        message
      });
    }
  }

  return ready;
}

async function syncPlaylist() {
  const store = await getVideoStore();
  const { videos, fromNetwork } = await resolvePlaylistVideos(store);

  if (fromNetwork) {
    await removeVideosNotOnPlaylist(store, videos);

    const wantedNames = new Set(videos.map(video => video.name));
    setSyncedPlaylist(syncedPlaylist.filter(video => wantedNames.has(video.name)));
  }

  const ready = await downloadPlaylistVideos(videos, fromNetwork);
  setSyncedPlaylist(ready);

  emitPlaylistEvent("signage-playlist-synced", {
    videos: ready,
    fromNetwork
  });

  return ready;
}

function syncPlaylistOnce() {
  if (!playlistSyncPromise) {
    playlistSyncPromise = syncPlaylist().finally(() => {
      playlistSyncPromise = null;
    });
  }

  return playlistSyncPromise;
}

function startPlaylistSync() {
  if (playlistSyncTimer == null) {
    playlistSyncTimer = window.setInterval(() => {
      void syncPlaylistOnce();
    }, PLAYLIST_SYNC_INTERVAL_MS);
  }

  return syncPlaylistOnce();
}
