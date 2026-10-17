const OPFS_PROBE_NAME = ".__signage_opfs_probe__";

async function getOpfsRoot() {
  if (!navigator.storage?.getDirectory) {
    throw new Error("Ta przeglądarka nie obsługuje OPFS.");
  }

  return navigator.storage.getDirectory();
}

async function probeOpfsWritable(root) {
  const handle = await root.getFileHandle(OPFS_PROBE_NAME, {
    create: true
  });

  try {
    const writable = await handle.createWritable();
    await writable.close();
  } finally {
    await root.removeEntry(OPFS_PROBE_NAME).catch(() => {});
  }
}

function createOpfsStoreFromRoot(root) {
  return {
    kind: "opfs",

    async has(name) {
      try {
        const handle = await root.getFileHandle(name);
        const file = await handle.getFile();
        return file.size > 0;
      } catch (error) {
        if (error.name === "NotFoundError") {
          return false;
        }

        throw error;
      }
    },

    async get(name) {
      try {
        const handle = await root.getFileHandle(name);
        const file = await handle.getFile();

        if (file.size === 0) {
          return null;
        }

        return file;
      } catch (error) {
        if (error.name === "NotFoundError") {
          return null;
        }

        throw error;
      }
    },

    async put(name, response) {
      if (!response?.ok || !response.body) {
        throw new Error(
          `Nie udało się zapisać ${name}: HTTP ${response?.status ?? "brak odpowiedzi"}`
        );
      }

      const handle = await root.getFileHandle(name, {
        create: true
      });
      const writable = await handle.createWritable();

      try {
        await response.body.pipeTo(writable);
      } catch (error) {
        await root.removeEntry(name).catch(() => {});
        throw error;
      }

      return handle.getFile();
    },

    async delete(name) {
      try {
        await root.removeEntry(name);
      } catch (error) {
        if (error.name !== "NotFoundError") {
          throw error;
        }
      }
    },

    async list() {
      const items = [];

      for await (const [name, handle] of root.entries()) {
        if (handle.kind !== "file" || name === OPFS_PROBE_NAME) {
          continue;
        }

        const file = await handle.getFile();
        items.push({ name, size: file.size });
      }

      return items;
    }
  };
}

async function createOpfsStore() {
  const root = await getOpfsRoot();
  await probeOpfsWritable(root);
  return createOpfsStoreFromRoot(root);
}
