const DEBUG_ERROR_LIMIT = 5;
const DEBUG_QUOTA_INTERVAL_MS = 10000;

const progressStatusLabels = {
  checking: "sprawdzanie",
  local: "lokalny",
  ready: "pobrano"
};

function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) {
    return "n/d";
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const digits = unit === 0 ? 0 : value >= 10 ? 1 : 2;
  return value.toFixed(digits) + " " + units[unit];
}

function setDebugText(id, text) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = text;
  }
}

function backendLabel(kind) {
  if (kind === "opfs") {
    return "OPFS";
  }

  if (kind === "cache") {
    return "Cache API";
  }

  return kind || "nieznany";
}

async function updateDebugBackend() {
  try {
    const store = await getVideoStore();
    setDebugText("debug-backend", backendLabel(store.kind));
  } catch (error) {
    setDebugText("debug-backend", "błąd");
    addDebugError(error?.message || String(error));
  }
}

async function updateDebugPersist(detail) {
  if (detail) {
    if (detail.supported === false) {
      setDebugText("debug-persist", "brak API");
      return;
    }

    setDebugText("debug-persist", detail.granted ? "tak" : "nie");
    return;
  }

  if (!navigator.storage?.persisted) {
    setDebugText("debug-persist", "brak API");
    return;
  }

  try {
    const persisted = await navigator.storage.persisted();
    setDebugText("debug-persist", persisted ? "tak" : "nie");
  } catch (error) {
    setDebugText("debug-persist", "błąd");
    addDebugError("Persist: " + (error?.message || error));
  }
}

async function updateDebugQuota() {
  if (!navigator.storage?.estimate) {
    setDebugText("debug-quota", "brak API");
    return;
  }

  try {
    const { usage, quota } = await navigator.storage.estimate();
    const percent = quota ? Math.min(100, (usage / quota) * 100) : null;
    const percentText = percent == null ? "" : ` (${percent.toFixed(1)}%)`;
    setDebugText(
      "debug-quota",
      `${formatBytes(usage)} / ${formatBytes(quota)}${percentText}`
    );
  } catch (error) {
    setDebugText("debug-quota", "błąd");
    addDebugError("Quota: " + (error?.message || error));
  }
}

function addDebugError(message) {
  const list = document.getElementById("debug-errors");

  if (!list || !message) {
    return;
  }

  const item = document.createElement("li");
  item.textContent = message;
  list.prepend(item);

  while (list.children.length > DEBUG_ERROR_LIMIT) {
    list.removeChild(list.lastChild);
  }
}

function onPlaylistProgress(event) {
  const { index, total, video, status } = event.detail || {};
  const label = progressStatusLabels[status] || status || "";
  const name = video?.name || "";
  const step = Number.isFinite(index) && Number.isFinite(total)
    ? `${index + 1}/${total}`
    : "";

  setDebugText(
    "debug-progress",
    [step, name, label].filter(Boolean).join(" · ")
  );
}

function onPlaylistSynced(event) {
  const { videos, fromNetwork } = event.detail || {};
  const count = videos?.length ?? 0;
  const source = fromNetwork ? "sieć" : "offline";

  setDebugText("debug-progress", `gotowe: ${count} filmów (${source})`);
  void updateDebugQuota();
}

function onPlaylistError(event) {
  const { video, message } = event.detail || {};

  addDebugError(message || "Nieznany błąd playlisty");

  if (video?.name) {
    setDebugText("debug-progress", `błąd: ${video.name}`);
  }

  void updateDebugQuota();
}

function initDebugOverlay() {
  void updateDebugBackend();
  void updateDebugPersist();
  void updateDebugQuota();

  window.addEventListener("signage-storage-persist", event => {
    void updateDebugPersist(event.detail);
  });
  window.addEventListener("signage-playlist-progress", onPlaylistProgress);
  window.addEventListener("signage-playlist-error", onPlaylistError);
  window.addEventListener("signage-playlist-synced", onPlaylistSynced);
  window.addEventListener("signage-playlist-pruned", () => {
    void updateDebugQuota();
  });

  window.setInterval(() => {
    void updateDebugQuota();
  }, DEBUG_QUOTA_INTERVAL_MS);
}

initDebugOverlay();
