if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('Workbox SW zarejestrowany!', reg.scope))
        .catch(err => console.error('Błąd rejestracji SW:', err));
    });
 }


async function enablePersistentStorage() {
  if (!navigator.storage?.persist) {
    console.warn("Persistent Storage nie jest obsługiwany.");
    return false;
  }

  try {
    const alreadyPersistent = await navigator.storage.persisted();

    if (alreadyPersistent) {
      console.log("Dane witryny są już chronione przed automatyczną eksmisją.");
      return true;
    }

    const granted = await navigator.storage.persist();

    console.log(
      granted
        ? "Przyznano trwałe przechowywanie danych."
        : "Przeglądarka nie przyznała trwałego przechowywania danych."
    );

    return granted;
  } catch (error) {
    console.error("Błąd Persistent Storage:", error);
    return false;
  }
}

enablePersistentStorage();
startPlaylistSync();
