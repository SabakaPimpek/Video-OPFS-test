
const videoFiles = [
  {
    url: "video/CityHall_3840x2160_4k.mp4",
    name: "CityHall_3840x2160_4k.mp4"
  },
  {
    url: "video/output_h264_4k.mp4",
    name: "output_h264_4k.mp4"
  },
  {
    url: "video/TheaterSquare_3840x2160_4k.mp4",
    name: "TheaterSquare_3840x2160_4k.mp4"
  }
];

async function getOPFSRoot() {
  if (!navigator.storage?.getDirectory) {
    throw new Error("Ta przeglądarka nie obsługuje OPFS.");
  }

  return navigator.storage.getDirectory();
}

async function getVideoFromOPFS(video) {
  const root = await getOPFSRoot();

  // Sprawdź, czy plik już istnieje.
  let handle;

  try {
    handle = await root.getFileHandle(video.name);
    const existingFile = await handle.getFile();

    if (existingFile.size > 0) {
      console.log("Film dostępny lokalnie:", video.name);
      return existingFile;
    }
  } catch (error) {
    if (error.name !== "NotFoundError") {
      throw error;
    }
  }

  // Pobierz film i zapisz go w OPFS.
  console.log("Pobieranie filmu:", video.name);

  const response = await fetch(video.url);

  if (!response.ok || !response.body) {
    throw new Error(
      `Nie udało się pobrać ${video.name}: HTTP ${response.status}`
    );
  }

  handle = await root.getFileHandle(video.name, {
    create: true
  });

  const writable = await handle.createWritable();

  try {
    await response.body.pipeTo(writable);
  } catch (error) {
    // Usuń niekompletny plik, aby nie uznać go za gotowy.
    await root.removeEntry(video.name).catch(() => {});
    throw error;
  }

  const file = await handle.getFile();

  console.log("Zapisano w OPFS:", video.name, file.size, "B");

  return file;
}

async function getLocalVideoURL(video) {
  const file = await getVideoFromOPFS(video);
  return URL.createObjectURL(file);
}
