const VIDEO_CACHE_NAME = "signage-videos";

function videoCacheRequest(name) {
  return new Request(name);
}

function fileNameFromCacheRequest(request) {
  try {
    const url = new URL(request.url, location.href);
    const fileName = decodeURIComponent(url.pathname.split("/").pop() || "");
    return fileName || request.url;
  } catch {
    return request.url;
  }
}

function responseSize(response) {
  const length = response.headers.get("content-length");

  if (length == null || length === "") {
    return null;
  }

  const size = Number(length);
  return Number.isFinite(size) ? size : null;
}

function createCacheStoreFromCache(cache) {
  return {
    kind: "cache",

    async has(name) {
      const match = await cache.match(videoCacheRequest(name));

      if (!match) {
        return false;
      }

      const size = responseSize(match);
      return size == null ? true : size > 0;
    },

    async get(name) {
      const match = await cache.match(videoCacheRequest(name));

      if (!match) {
        return null;
      }

      const blob = await match.blob();

      if (blob.size === 0) {
        return null;
      }

      const type = blob.type || match.headers.get("content-type") || "video/mp4";
      return new File([blob], name, { type });
    },

    async put(name, response) {
      if (!response?.ok) {
        throw new Error(
          `Nie udało się zapisać ${name}: HTTP ${response?.status ?? "brak odpowiedzi"}`
        );
      }

      const request = videoCacheRequest(name);

      try {
        await cache.put(request, response);
      } catch (error) {
        await cache.delete(request).catch(() => {});
        throw error;
      }

      const stored = await cache.match(request);

      if (!stored) {
        throw new Error(`Zapis do Cache API nie powiódł się: ${name}`);
      }

      const blob = await stored.blob();
      const type = blob.type || stored.headers.get("content-type") || "video/mp4";
      return new File([blob], name, { type });
    },

    async delete(name) {
      await cache.delete(videoCacheRequest(name));
    },

    async list() {
      const keys = await cache.keys();
      const items = [];

      for (const request of keys) {
        const match = await cache.match(request);

        if (!match) {
          continue;
        }

        const name = fileNameFromCacheRequest(request);
        const headerSize = responseSize(match);
        items.push({
          name,
          size: headerSize == null ? 0 : headerSize
        });
      }

      return items;
    }
  };
}

async function createCacheStore() {
  if (!("caches" in window)) {
    throw new Error("Ta przeglądarka nie obsługuje Cache API.");
  }

  const cache = await caches.open(VIDEO_CACHE_NAME);
  return createCacheStoreFromCache(cache);
}
