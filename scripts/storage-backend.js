// Ustaw na true, aby wymusić Cache API (symulacja WebView bez OPFS).
const FORCE_CACHE_STORAGE = false;

let videoStorePromise = null;

async function detectStorageBackend() {
  if (!FORCE_CACHE_STORAGE) {
    try {
      const opfsStore = await createOpfsStore();
      console.log("Magazyn filmów: OPFS");
      return opfsStore;
    } catch (error) {
      console.warn("OPFS niedostępny, używam Cache API.", error);
    }
  } else {
    console.warn("Wymuszono Cache API (FORCE_CACHE_STORAGE).");
  }

  const cacheStore = await createCacheStore();
  console.log("Magazyn filmów: Cache API");
  return cacheStore;
}

function getVideoStore() {
  if (!videoStorePromise) {
    videoStorePromise = detectStorageBackend();
  }

  return videoStorePromise;
}
