if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('Workbox SW zarejestrowany!', reg.scope))
        .catch(err => console.error('Błąd rejestracji SW:', err));
    });
 }


function emitPersistStatus(granted, supported) {
  window.dispatchEvent(new CustomEvent("signage-storage-persist", {
    detail: { granted, supported }
  }));
}

async function enablePersistentStorage() {
  if (!navigator.storage?.persist) {
    console.warn("Persistent Storage nie jest obsługiwany.");
    emitPersistStatus(false, false);
    return false;
  }

  try {
    const alreadyPersistent = await navigator.storage.persisted();

    if (alreadyPersistent) {
      console.log("Dane witryny są już chronione przed automatyczną eksmisją.");
      emitPersistStatus(true, true);
      return true;
    }

    const granted = await navigator.storage.persist();

    console.log(
      granted
        ? "Przyznano trwałe przechowywanie danych."
        : "Przeglądarka nie przyznała trwałego przechowywania danych."
    );

    emitPersistStatus(granted, true);
    return granted;
  } catch (error) {
    console.error("Błąd Persistent Storage:", error);
    emitPersistStatus(false, true);
    return false;
  }
}

enablePersistentStorage();
startPlaylistSync();
