# Blueprint: 14_embedded_media_archive (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter instrueras att läsa denna fil exakt en gång vid uppstart och betrakta den som orubblig lag. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**. Om ett gränssnitt behöver ändras, MÅSTE agenten stanna, eskalera till Master Coordinator och invänta en uppdaterad blueprint.

---

## 1. Syfte & Strategiskt Mål
Etablera mappen `HockeyJockey/src/media` (`/home/ma-auto/DEV/HockeyJockey/src/media`) som ett inbäddat mediaarkiv. Alla accepterade ljudfiler som placeras i denna mapp ska automatiskt upptäckas och importeras när applikationen laddas så att de omedelbart blir spelbara både som färdiga knappar på Soundboarden och valbara i Soundboard-konfigurationen utan manuell uppladdning.

---

## 2. Rollfördelning & Ansvarsområden
*   **Lead Architect (Master-agenten i ai-master-config):** Äger denna Sacred Truth-specifikation.
*   **`Agent-Logic` (`Claude Sonnet 5.5 (Medium)`):** Implementerar ändringarna i `/home/ma-auto/DEV/HockeyJockey/` (`src/`, `src/media/`, `vite.config.ts`) autonomt i Sandbox Mode utan att röra `tests/` eller `*_init.md`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan uppgiften lösas med inbyggda terminalkommandon? | **Nej** |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt eftersom Nivå 3 väljs:* | Automatisk rekursiv skanning av `src/media`, HTTP 206 Byte-Range-strömning för exakt tidssökning (`startTimeMs`) i `HTMLAudioElement`, produktions-glob-fallback och idempotent import till React/Zustand vid appstart kräver TypeScript-kod i Vite och SPA-lagret. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `npm`, `tsc`, `vite`, `git`. |
| **Maskinberoende (Capabilities)** | Krävs specifika verktyg? | `node,npm,git,python` |
| **Gate Runner Integration** | Deterministiska kontroller | Stage 1: `npx tsc --noEmit`; full 5-stegsgrind exekveras i modul `15_oracle_embedded_media_archive`. |

---

## 4. Sacred Truth (Design & Arkitektur)

### 4.1 Arkivkatalog (`src/media`)
*   **Sökväg:** `/home/ma-auto/DEV/HockeyJockey/src/media`.
*   Om katalogen saknas skapas den med `.gitkeep` (eventuella befintliga ljudfiler i mappen bevaras alltid intakta).

### 4.2 Ren Domänlogik (`src/utils/domain.ts`, 100 % fri från DOM/`window`/`localStorage`)
1. `export const ACCEPTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.webm', '.opus'] as const;`
2. `export function isAcceptedAudioFileName(fileName: string): boolean` — Returnerar `true` endast om trimmat basnamn inte börjar med `'.'` och slutar på någon av `ACCEPTED_AUDIO_EXTENSIONS` (case-insensitive).
3. `export function inferAudioMimeType(fileName: string): string` — Returnerar korrekt MIME-typ (`audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/mp4`, `audio/flac`, `audio/aac`, `audio/webm`, fallback `application/octet-stream` eller `audio/mpeg`).
4. `export function buildEmbeddedMediaUri(relativePathOrName: string): string` — Skapar ett stabilt, deterministiskt `local:audio:media-<slug>-<kort-hash>`- eller `local:audio:media-<slug>`-ID (garanterat matchande `LOCAL_AUDIO_URI_REGEX`) så att samma fil i `src/media` alltid får identisk `trackUri` vid varje sidladdning (och två filer med olika undermappar eller ändelser aldrig kolliderar).

### 4.3 Vite Middleware (`vite.config.ts`) & Media-tjänst (`src/services/localAudioStorage.ts`)
1. **I `vite.config.ts` (för både `configureServer` och `configurePreviewServer`):**
   * `GET /api/media-archive`:
     * Skannar `/home/ma-auto/DEV/HockeyJockey/src/media` rekursivt i alfabetisk ordning, filtrerar med `isAcceptedAudioFileName`, och returnerar HTTP `200` JSON:
       `{ archiveDir: 'HockeyJockey/src/media', files: Array<{ trackUri, fileName, relativePath, title, artist, mimeType, sizeBytes, streamUrl }> }`,
       där `trackUri = buildEmbeddedMediaUri(relativePath)`, `{ title, artist } = parseLocalAudioFilename(fileName)` och `streamUrl = '/api/media-archive/file?path=' + encodeURIComponent(relativePath)`.
   * `GET /api/media-archive/file?path=<relativePath>`:
     * Validerar strikt mot path traversal (`path.resolve` måste ligga inuti `src/media`) samt att `isAcceptedAudioFileName(path.basename(...))` är `true`.
     * Returnerar `404` om filen inte finns, `403` vid path traversal / ej tillåten filändelse.
     * Stödjer `Accept-Ranges: bytes` och `Range: bytes=start-end` (`206 Partial Content` med `Content-Range` och `Content-Length`) samt vanlig `200 OK` så att `HTMLAudioElement` alltid kan söka till `startTimeMs`.
2. **I `src/services/localAudioStorage.ts`:**
   * `export interface EmbeddedMediaItem { trackUri: string; fileName: string; relativePath: string; title: string; artist: string; mimeType: string; sizeBytes?: number; streamUrl: string; }`
   * `registerEmbeddedMediaItems(items: EmbeddedMediaItem[]): void` — Registrerar `trackUri -> EmbeddedMediaItem` (inkl. `streamUrl`) i intern karta så att `getLocalAudioPlaybackUrl(trackUri)` och `getLocalAudioRecord(trackUri)` direkt kan spela upp inbäddade mediafiler utan IndexedDB-kopiering.
   * `syncEmbeddedMediaArchive(): Promise<EmbeddedMediaItem[]>` — Hämtar från `GET /api/media-archive` (när tillgänglig i webbläsare) och faller tillbaka på / kompletterar med `typeof import.meta.glob === 'function'` för `'/src/media/**/*.{mp3,wav,ogg,m4a,flac,aac,webm,opus}'` (i Vite-produktionsbygge; säker guard så Node.js/`tsx` aldrig kraschar!). Anropar `registerEmbeddedMediaItems` och returnerar listan. (Se till att `vite/client`-typer finns i `src/vite-env.d.ts` eller `tsconfig.json` så `npx tsc --noEmit` passerar).

### 4.4 Automatisk Import vid Laddning (`src/store/useAppStore.ts` & `src/App.tsx`)
1. **Zustand-store (`src/store/useAppStore.ts`):**
   * Lägg till `embeddedMediaTracks: EmbeddedMediaItem[]` (runtime-lista över aktuella filer i `src/media`) samt `autoImportedMediaUris: string[]` (persisteras i `hockey_dj_state_v1`, ej krav på ändring i `MatchConfigSnapshot` så att befintliga JSON-rundresor förblir 100 % oförändrade).
   * Lägg till action `importEmbeddedMediaArchive(items: EmbeddedMediaItem[]): { totalArchiveCount: number; newlyAddedCount: number }`:
     * Uppdaterar `embeddedMediaTracks` med `items`.
     * Om `items.length > 0`:
       * För varje `item` i `items`:
         * Uppdaterar eventuell befintlig `TrackCue` med matchande `trackUri` eller `localFileName` till senaste `sourceType: 'local'`, `localFileName`, `mimeType`.
         * Om `item.trackUri` **varken** finns i `autoImportedMediaUris` **eller** redan finns på någon `SoundPad` i `soundPads`:
           * Säkerställer att gruppen `{ id: 'media_archive', label: 'Inbäddat Mediaarkiv' }` finns i `settings.soundboardGroups` (läggs endast till när minst en ny fil auto-importeras och gruppen saknas).
           * Skapar automatiskt en färdig `SoundPad` i gruppen `'media_archive'` med knappnamn `item.title`, färg `'#0891b2'`, volym `1.0`, och `[ { trackUri: item.trackUri, title: item.title, artist: item.artist, startTimeMs: 0, sourceType: 'local', localFileName: item.fileName, mimeType: item.mimeType } ]`.
           * Lägger till `item.trackUri` i `autoImportedMediaUris` (idempotens: om användaren senare redigerar eller raderar knappen återimporteras den inte oönskat vid nästa laddning!).
2. **Automatisk körning i `src/App.tsx`:**
   * Vid mount i `App.tsx` körs `void syncEmbeddedMediaArchive().then((items) => useAppStore.getState().importEmbeddedMediaArchive(items))` automatiskt utan att blockera uppstarten.

### 4.5 Gränssnitt (`src/components/SetupView.tsx`)
* Under fliken **Soundboard & Låtpooler**:
  * **Panel "Inbäddat Mediaarkiv (`HockeyJockey/src/media`)":**
    * Visar sökvägen `HockeyJockey/src/media`, antal hittade ljudfiler samt knapp **`Skanna om src/media nu`** (som anropar `syncEmbeddedMediaArchive()` + `importEmbeddedMediaArchive()` och visar en bekräftelsenotis).
    * Listar alla ljudfiler i arkivet med **`[PROVSPELA 5 SEK]`** och **`[+ Lägg till som Soundboard-knapp]`**.
  * **I `SoundPadEditor` (både i "+ Lägg till låt i poolen" och på befintliga spår):**
    * När `embeddedMediaTracks.length > 0`, visas en dropdown **`Välj från src/media...`** så att valfri arkivfil med ett klick kan läggas till eller ersätta spåret på valfri knapp.

---

## 5. Oracle Contract (The Gate of Truth)
Verifieras av `Agent-Oracle` i Modul `15_oracle_embedded_media_archive` via `tests/test_unit_domain.py`, `tests/oracle_hockeyjockey.py` och `/home/ma-auto/DEV/bin/invoke-v2-gate` med `exit code 0` och `"overall_status": "VERIFIED"`.

---

## 6. Resursallokering & Sub-Agent Roster

| Roster-Profil | Tilldelad Modell & Tier (`models.json`) | Ansvarsområde |
| :--- | :--- | :--- |
| **`Agent-Logic`** | **Claude Sonnet 5.5 (Medium)** | Nivå 3 Custom Code för Modul 14 (`src/`, `src/media/`, `vite.config.ts`). |

**Tilldelad Roster-Profil för denna modul:** `Agent-Logic`  
**Tilldelad Modell:** `Claude Sonnet 5.5 (Medium)`
