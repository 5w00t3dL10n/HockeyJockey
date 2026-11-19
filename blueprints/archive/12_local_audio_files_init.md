# Blueprint: 12_local_audio_files (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter instrueras att läsa denna fil exakt en gång vid uppstart och betrakta den som orubblig lag. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**. Om ett gränssnitt behöver ändras, MÅSTE agenten stanna, eskalera till Master Coordinator och invänta en uppdaterad blueprint.

---

## 1. Syfte & Strategiskt Mål
Utöka **HockeyJockey** så att användaren kan välja in och spela **lokala ljudfiler** (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac`, `.webm`) direkt i Soundboarden som alternativ eller komplement till Spotify-spår — inklusive exakt starttid (`MM:SS` / `ms`), 5-sekunders provspelning, ducking (`400 ms`), fade-out (`600 ms`), tvärstopp och persistent lagring i webbläsarens IndexedDB.

---

## 2. Rollfördelning & Ansvarsområden
*   **Lead Architect (Master-agenten i ai-master-config):** Äger denna Sacred Truth-specifikation.
*   **`Agent-Logic` (`Claude Sonnet 5.5 (Medium)`):** Implementerar ändringarna i `/home/ma-auto/DEV/HockeyJockey/src/` autonomt i Sandbox Mode utan att röra `tests/` eller `*_init.md`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan uppgiften lösas med inbyggda terminalkommandon? | **Nej** |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt eftersom Nivå 3 väljs:* | Lagring av binära ljudblobbar i webbläsarens IndexedDB, HTML5 `HTMLAudioElement`-tidssökning, 50 ms volymramper för ducking/fade-out samt samspel mellan lokal ljudtransport och Spotify kan inte lösas med OS-nativa terminalkommandon. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `npm`, `tsc`, `vite`, `git`. |
| **Maskinberoende (Capabilities)** | Krävs specifika verktyg? | `node,npm,git,python` |
| **Gate Runner Integration** | Deterministiska kontroller | Stage 1: `npx tsc --noEmit`; full 5-stegsgrind exekveras i modul `13_oracle_local_audio_files`. |

---

## 4. Sacred Truth (Design & Arkitektur)

### 4.1 Datamodeller (`src/types/models.ts`)
1. `export type TrackSourceType = 'spotify' | 'local';`
2. `TrackCue` utökas bakåtkompatibelt med valfria fält:
   * `sourceType?: TrackSourceType;`
   * `localFileName?: string;`
   * `mimeType?: string;`

### 4.2 Ren Domänlogik (`src/utils/domain.ts`, 100 % fri från DOM/`window`/`localStorage`)
1. **Lokal Ljud-URI (`local:audio:<id>`):**
   * `LOCAL_AUDIO_URI_REGEX = /^local:audio:([A-Za-z0-9_-]{3,120})$/;`
   * `isLocalAudioUri(input: string): boolean`: returnerar `true` om trimmad sträng matchar `LOCAL_AUDIO_URI_REGEX`.
   * `createLocalAudioUri(id?: string): string`: genererar en giltig `local:audio:<id>`-URI.
   * Uppdatera `tryParseSpotifyUri(input: string)` och `parseSpotifyUri(input: string)` så att de accepterar **både** Spotify-länkar/URI:er **och** giltiga lokala ljud-URI:er (`local:audio:<id>`). (`extractSpotifyTrackId(input)` fortsätter att returnera `null` för `local:audio:...` så endast riktiga Spotify-spår triggar Spotify-metadatahämtning).
2. **Filnamnsparsning (`parseLocalAudioFilename`):**
   * `parseLocalAudioFilename(fileName: string): { title: string; artist: string }`:
     * Tar bort filändelsen (t.ex. `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac`, `.webm`) och ersätter understreck `_` med mellanslag.
     * Om det rensade namnet innehåller `" - "` eller `" – "` (t.ex. `"Zombie Nation - Kernkraft 400.mp3"`), delas det på första separatorn till `artist` (`"Zombie Nation"`) och `title` (`"Kernkraft 400"`).
     * Annars sätts `title` till det rensade namnet (t.ex. `"Goal_Horn_Sundsvall.wav"` -> `"Goal Horn Sundsvall"`) och `artist` till `"Lokal ljudfil"`.
3. **Uppdaterad `sanitizeTrackCue` (100 % bakåtkompatibel):**
   * Om `isLocalAudioUri(parsedUri.uri)` är `true`: sätter alltid `sourceType: 'local'` samt bevarar icke-tomma `localFileName` och `mimeType`.
   * Om `isLocalAudioUri(parsedUri.uri)` är `false` (Spotify-spår): inkluderar `sourceType: 'spotify'` **endast** om `rawTrack.sourceType === 'spotify'` var explicit angivet i indata; om `rawTrack.sourceType` saknades (eller felaktigt var `'local'` på en Spotify-URI) utelämnas `sourceType` på det returnerade objektet så att äldre snapshots och befintliga tester förblir identiska.

### 4.3 Persistent Lagring för Lokala Ljudfiler (`src/services/localAudioStorage.ts`)
1. **IndexedDB + Headless/In-Memory Fallback:**
   * Databasnamn: `'hockey_dj_local_audio_db'`, Object Store: `'audio_files'`.
   * När `typeof indexedDB === 'undefined'` (t.ex. under headless Node.js-tester i Stage 4) används en in-memory `Map<string, StoredLocalAudio>` så att alla funktioner fungerar deterministiskt utan DOM/IndexedDB.
   * Gränssnitt `StoredLocalAudio`:
     * `trackUri: string` (`local:audio:<id>`)
     * `fileName: string`
     * `mimeType: string`
     * `sizeBytes: number`
     * `data: Blob | Uint8Array | ArrayBuffer`
     * `createdAt: string`
   * Exporterade funktioner:
     * `saveLocalAudioFile(file: { name: string; type?: string; size?: number; arrayBuffer?: () => Promise<ArrayBuffer> } | Blob, customUri?: string): Promise<{ trackUri: string; fileName: string; mimeType: string; title: string; artist: string }>`
     * `getLocalAudioRecord(trackUri: string): Promise<StoredLocalAudio | null>`
     * `getLocalAudioPlaybackUrl(trackUri: string): Promise<string | null>` (skapar och cachear `URL.createObjectURL` i webbläsare, eller returnerar `blob:local-memory/<id>` i headless Node).
     * `deleteLocalAudioFile(trackUri: string): Promise<void>` (rensar både IndexedDB/memory och ev. cache:ad Object URL).
     * `listLocalAudioFiles(): Promise<Array<Omit<StoredLocalAudio, 'data'>>>`

### 4.4 Lokal Ljuduppspelning i `AudioController` (`src/services/audioController.ts`)
1. **Lokal Ljudtransport (`HTMLAudioElement`):**
   * När `playAt(trackUri, positionMs, targetVolume, previewMs, trackMeta)` anropas med `isLocalAudioUri(trackUri)`:
     * Om Spotify-adaptern är aktiv/redo pausas eventuell pågående Spotify-uppspelning (`await this.adapter.pause()`).
     * Stoppar simulerad synth och eventuell tidigare lokal ljudfil (`stopLocalAudioElement()`).
     * Markerar att aktiv uppspelning är lokal (`activeSourceType = 'local'`) så att `applyTransportVolume()` inte skickar oönskade Spotify Connect-volymanrop medan en lokal ljudfil spelas eller duckas.
     * Hämtar uppspelnings-URL via `getLocalAudioPlaybackUrl(trackUri)`.
     * **I webbläsare (`typeof Audio !== 'undefined'` och uppspelnings-URL finns):**
       * Skapar `HTMLAudioElement`, sätter `volume = safeVolume`, söker till `safePosition / 1000` sekunder (direkt om `readyState >= 1`, annars i `loadedmetadata`), och anropar `audio.play()`.
       * Uppdaterar `this.state` med `isPlaying: true`, `isDucked: false`, `positionMs: safePosition`, `currentTrack: { ...track, sourceType: 'local' }`, `statusMessage: 'Spelar lokal ljudfil: ' + track.title`, `error: null`.
       * Hanterar `ended`-eventet genom att stoppa positionstickern och sätta `isPlaying: false`.
     * **I headless-läge eller om filen saknas:**
       * Kör säker Calm Tech-fallback så att tillstånd, 50 ms volymramper (`duckVolume`, `restoreVolume`, `fadeOutAndPause`) och `hardStop` alltid fungerar deterministiskt.
   * När ett Spotify-spår startas via `playAt(...)` stoppas alltid `stopLocalAudioElement()` först och `activeSourceType = 'spotify'` återställs.
   * `applyTransportVolume(volume)`: uppdaterar `localAudioElement.volume = clamped` omedelbart vid varje rampsteg.
   * `pauseTransport()`: pausar och stannar `localAudioElement` omedelbart vid `fadeOutAndPause` och `hardStop`.

### 4.5 Gränssnitt (`src/components/SetupView.tsx`, `src/components/MatchView.tsx`, `src/components/TopBar.tsx`)
1. **`SetupView.tsx` (fliken `Soundboard & Låtpooler`):**
   * I både **"+ Lägg till låt i poolen"** (med stöd för `multiple` så flera filer kan laddas in samtidigt!) och på **varje befintlig låt (`TrackCueRow`)**:
     * Knapp **`Välj lokal ljudfil...`** med dold `<input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.webm" />`.
     * Sparar vald fil via `saveLocalAudioFile(file)`, fyller automatiskt i `trackUri` (`local:audio:...`), `sourceType: 'local'`, `localFileName`, `mimeType`, `title` och `artist`.
     * Visar en tydlig badge (`Lokal ljudfil: <filnamn>`) istället för att försöka hämta Spotify-metadata, samt stödjer starttid (`MM:SS`) och `[PROVSPELA 5 SEK]`.
     * Om ett lokalt spår saknar sparad ljudfil i denna webbläsares IndexedDB (t.ex. efter JSON-import på en ny dator), visas en hjälpsam indikation med knapp för att välja om ljudfilen.
2. **`MatchView.tsx` & `TopBar.tsx`:**
   * Visar tydlig indikator i `MatchView` när nästa spår på en Soundboard-knapp är en lokal ljudfil (t.ex. `Lokal`) och i `TopBar` när en lokal ljudfil spelas upp.

---

## 5. Oracle Contract (The Gate of Truth)
Verifieras av `Agent-Oracle` i Modul `13_oracle_local_audio_files` via `tests/test_unit_domain.py`, `tests/oracle_hockeyjockey.py` och `/home/ma-auto/DEV/bin/invoke-v2-gate` med `exit code 0` och `"overall_status": "VERIFIED"`.

---

## 6. Resursallokering & Sub-Agent Roster

| Roster-Profil | Tilldelad Modell & Tier (`models.json`) | Ansvarsområde |
| :--- | :--- | :--- |
| **`Agent-Logic`** | **Claude Sonnet 5.5 (Medium)** | Nivå 3 Custom Code för Modul 12 (`src/`). |

**Tilldelad Roster-Profil för denna modul:** `Agent-Logic`  
**Tilldelad Modell:** `Claude Sonnet 5.5 (Medium)`
