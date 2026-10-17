# Dokumentacja techniczna — kiosk w WebView

Krótki opis, jak ta strona trzyma filmy lokalnie, synchronizuje playlistę i odtwarza je bez mostków JS–Android.

## Problem

Kiosk na **Android WebView** ma działać offline po wstępnym pobraniu, bez natywnego magazynu plików i bez `JavascriptInterface`. Lista filmów przychodzi z JSON (lokalnego lub zdalnego). Pliki MP4 są dociągane z sieci i zostają w przeglądarce: **OPFS** gdy WebView to umie, **Cache API** w przeciwnym razie. Odtwarzanie idzie przez `URL.createObjectURL(File|Blob)`, żeby nie obsługiwać żądań `Range` w Service Workerze.

Host Android nie jest częścią tego repozytorium — tu jest tylko warstwa web.

## Magazyn: OPFS vs Cache API vs IndexedDB

| Mechanizm | Do czego | Dlaczego tu |
| --- | --- | --- |
| **OPFS** (`navigator.storage.getDirectory` + `createWritable`) | Duże pliki, zapis strumieniem (`pipeTo`) | Preferowany backend. Plik da się odczytać jako `File` i podać do `<video>` jako blob URL. |
| **Cache API** (`caches.open('signage-videos')`) | Zapas na starszy Chromium / WebView bez zapisu OPFS | Ten sam interfejs (`has` / `get` / `put` / `delete` / `list`). Odczyt: `response.blob()` → `File`. |
| **IndexedDB** | Małe rekordy, metadane | **Nie** na wielogigabajtowe MP4: narzut blobów w IDB, wolniejsze zapisy, trudniejszy streaming, limity i eksmisja i tak nie znikają. |

Wspólne API jest w `scripts/storage-backend.js`. Implementacje: `scripts/opfs-store.js`, `scripts/cache-store.js`. Pobieranie i sprawdzanie rozmiaru: `scripts/video-storage.js`.

Service Worker (`sw.js`) cache’uje **app shell** (HTML/CSS/JS/logo) i playlistę (`NetworkFirst`). **Filmy nie przechodzą przez Workbox** — zapisuje je okno do OPFS albo Cache API.

## Detekcja możliwości, nie wersji Androida

Backend wybierany jest w runtime, nie po numerze API Androida:

1. Jeśli `FORCE_CACHE_STORAGE` w `storage-backend.js` jest `false`, aplikacja próbuje OPFS: `getDirectory` oraz **probe** `createWritable` (plik `.__signage_opfs_probe__`, potem usuwany).
2. Błąd (brak API, stary Chromium ~przed 102, ograniczenia WebView) → Cache API.
3. `FORCE_CACHE_STORAGE = true` wymusza Cache API (test braku OPFS na desktopie).

Panel diagnostyczny pokazuje wybrany backend, `navigator.storage.estimate()` (usage/quota), wynik `persist()` i postęp sync.

## Format playlisty i sync

Stała `PLAYLIST_URL` w `scripts/playlist.js` (domyślnie `playlist.json`). Na kiosku podmień na URL serwera.

```json
{
  "version": 1,
  "updatedAt": "2026-10-17T12:00:00Z",
  "videos": [
    {
      "id": "cityhall",
      "url": "https://cdn.example.com/CityHall_3840x2160_4k.mp4",
      "name": "CityHall_3840x2160_4k.mp4",
      "size": 123456789
    }
  ]
}
```

Wymagane: `name`, `url`. `id` opcjonalne (domyślnie `name`). `size` opcjonalne — gdy jest, lokalny plik o innym rozmiarze jest pobierany ponownie.

Algorytm (`startPlaylistSync`, co 5 minut i przy starcie):

1. Pobierz JSON (`fetch` z `cache: "no-store"`; SW też ma `NetworkFirst` dla `playlist.json`). Udany wynik trafia do `localStorage`.
2. Przy błędzie sieci: kopia z `localStorage`, a jeśli jej nie ma — lista plików już w magazynie.
3. **Gdy jest sieć:** usuń lokalne filmy, których nie ma na liście (`name`).
4. Dla każdego wpisu: jeśli plik jest i `size` się zgadza — użyj lokalnego; w przeciwnym razie dociągnij streamem (`ensureVideo`).
5. Player dostaje gotową listę (`id`/`name`), nie tablicę wpisaną w `video.js`.
6. Po pierwszym gotowym filmie `play()` startuje sam (muted + playsinline). Klik w stronę to fallback polityki autoplay.

Kodeki na Androidzie: **H.264 + AAC w MP4**.

## Gapless: dwa elementy `<video>`

W `index.html` są `playerA` i `playerB`. Jeden jest `active` (widoczny), drugi ładuje następny klip.

Przy `ended` aktywnego: następny ma już źródło (blob URL), `currentTime = 0`, `play()`, ewentualnie `requestVideoFrameCallback`, potem zamiana klas CSS. Stary player jest pauzowany. Przy jednej pozycji na liście ten sam klip odtwarza się od zera.

Źródło zawsze z magazynu lokalnego, nigdy bezpośrednio z sieci w `<video src>`.

## Uruchomienie

### Lokalnie (Chrome)

Strona musi iść z **http(s) origin** (OPFS, Cache API, SW nie działają z `file://`). Przykład:

```bash
npx --yes serve .
```

Otwórz origin w Chrome. Panel „Diagnostyka” powinien pokazać backend **OPFS** (nowy Chromium). Playlista z repo wskazuje na `video/*.mp4`.

Test Cache API: ustaw `FORCE_CACHE_STORAGE` na `true` w `scripts/storage-backend.js` i odśwież.

Offline: po pełnym sync wyłącz sieć (DevTools) i odśwież — powinny grać już zapisane pliki.

### Android WebView

1. Serwuj stronę przez **HTTPS** (lub zaufany origin kiosku).
2. Włącz JavaScript. **Bez** `JavascriptInterface` — ta aplikacja go nie potrzebuje.
3. Aktualny System WebView z Play (OPFS od Chromium ~102+; starszy padnie na Cache API).
4. Filmy: H.264/AAC MP4. Autoplay: `muted` + `playsinline` w HTML; w hostcie wystarczy standardowy WebView.
5. Na urządzeniu sprawdź panel: backend, persist, quota, autoplay.

Narzędzia przeglądarkowe Cursor nie oddają Androida — weryfikacja kiosku to desktop + Twój WebView.

## Znane limity

- **`persist()` nie jest gwarancją.** Aplikacja woła `navigator.storage.persist()`; Chrome/WebView może odmówić. Cache API i tak może zostać wyeksmitowany przy presji miejsca.
- **Quota.** Duże 4K szybko zapełniają limit originu. Brak miejsca to czytelny błąd (`QuotaExceededError`) w panelu, nie cichy fail. Usunięcie wpisu z JSON kasuje lokalny plik przy następnym sync z siecią.
- **4K.** Dekodowanie zależy od SoC i WebView; to nie jest transkodowanie po stronie aplikacji.
- **Range / SW.** Filmy nie są przechwytywane przez Workbox właśnie dlatego, że żądania zakresowe w SW są kruche przy dużych MP4.
- **Autoplay.** Jeśli polityka zablokuje `play()`, wystarczy klik (listener na `window`).
- **Probe OPFS** nie oznacza, że quota wystarczy na wszystkie klipy — to tylko test zapisu.
