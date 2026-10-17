function matchesExpectedSize(file, expectedSize) {
  if (!file || file.size <= 0) {
    return false;
  }

  if (expectedSize == null) {
    return true;
  }

  return file.size === expectedSize;
}

function quotaMessage(name, error) {
  if (error?.name === "QuotaExceededError") {
    return `Brak miejsca w magazynie przy zapisie ${name}.`;
  }

  return error?.message || String(error);
}

async function getLocalVideoFile(video) {
  const store = await getVideoStore();
  const existingFile = await store.get(video.name);

  if (matchesExpectedSize(existingFile, video.size)) {
    return existingFile;
  }

  return null;
}

async function ensureVideo(video) {
  const store = await getVideoStore();
  const existingFile = await store.get(video.name);

  if (matchesExpectedSize(existingFile, video.size)) {
    console.log("Film dostępny lokalnie:", video.name, "(" + store.kind + ")");
    return existingFile;
  }

  if (existingFile) {
    console.log(
      "Rozmiar nie zgadza się, pobieram ponownie:",
      video.name,
      existingFile.size,
      "≠",
      video.size
    );
    await store.delete(video.name);
  }

  console.log("Pobieranie filmu:", video.name);

  const response = await fetch(video.url);

  if (!response.ok || !response.body) {
    throw new Error(
      `Nie udało się pobrać ${video.name}: HTTP ${response.status}`
    );
  }

  try {
    const file = await store.put(video.name, response);

    if (!matchesExpectedSize(file, video.size)) {
      await store.delete(video.name);
      throw new Error(
        `Zapisany plik ${video.name} ma rozmiar ${file.size} B, oczekiwano ${video.size} B`
      );
    }

    console.log("Zapisano w", store.kind + ":", video.name, file.size, "B");
    return file;
  } catch (error) {
    throw new Error(quotaMessage(video.name, error));
  }
}

async function getVideoFromOPFS(video) {
  return ensureVideo(video);
}

async function getLocalVideoURL(video) {
  const file = await ensureVideo(video);
  return URL.createObjectURL(file);
}
