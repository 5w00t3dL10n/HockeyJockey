# Blueprint: 06_away_goal_and_track_metadata (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter instrueras att läsa denna fil exakt en gång vid uppstart och betrakta den som orubblig lag. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**. Om ett gränssnitt behöver ändras, MÅSTE agenten stanna, eskalera till Master Coordinator och invänta en uppdaterad blueprint.

---

## 1. Syfte & Strategiskt Mål
Utöka **HockeyJockey** med två användarbegärda förbättringar:
1. **Konfigurerbar Sportslig Tystnad vid Bortamål (`awayGoalSilence`):** Gör det möjligt i Inställningar (och per matchprofil samt snabbväxling i målmodalen) att välja mellan sportslig tystnad vid bortamål (med manuell knapp `STARTA OMSTART / PEPP-LÅT` inför tekning) eller att musik från bortamål-/omstartslistan startar automatiskt direkt vid klick på `MÅL BORTALAG`.
2. **Automatisk Import av Låttitel & Artist från Spotify-delningslänk:** När en Spotify-delningslänk (t.ex. `https://open.spotify.com/track/4QcBuV31ukMvsvviytKjWx?si=ccd5352978464589`) eller URI klistras in i Soundboard-konfigurationen hämtas låtens titel och artist automatiskt och fylls i formuläret.

---

## 2. Rollfördelning & Ansvarsområden (Who Does What)
*   **Dirigenten (Människan/Kaptenen):**
    *   Har begärt inställningen för sportslig tystnad vid bortamål och automatisk import av låttitel/artist från Spotify-länkar.
*   **Lead Architect (Master-agenten i ai-master-config):**
    *   Äger denna Sacred Truth-specifikation. Rör ingen delprojekt-källkod direkt.
*   **Specialiserad Sub-Agent (`Agent-Logic` — `Claude Sonnet 5.5 (Medium)`):**
    *   Implementerar ändringarna i `/home/ma-auto/DEV/HockeyJockey/` (`src/` och `vite.config.ts`) autonomt via filverktyg i Sandbox Mode. Rör ALDRIG denna `_init.md`-fil eller `tests/`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan uppgiften lösas med inbyggda terminalkommandon? | **Nej** |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt eftersom Nivå 3 väljs:* Varför räcker inte OS-Native? | Asynkron metadatahämtning med 3-stegs-vattenfall (Web API -> Vite server-middleware -> oEmbed), HTML/JSON-parsning för Spotify Embed-data i webbläsar-UI med reaktiv formulärifyllnad, samt tillståndsstyrd ljudlogik i React/Zustand kan inte lösas med OS-nativa terminalkommandon. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg i stacken? | **Ja** – `npm`, `tsc`, `vite`, `git`. |
| **Maskinberoende (Capabilities)** | Kräver uppgiften verktyg som kanske saknas? | `node,npm,git,python` |
| **Gate Runner Integration** | Deterministiska kontroller | Stage 1: `npx tsc --noEmit`; full 5-stegsgrind exekveras i modul `07_oracle_away_goal_and_metadata` via `invoke-v2-gate`. |

---

## 4. Sacred Truth (Design & Arkitektur)

### 4.1 Inställning för Sportslig Tystnad vid Bortamål (`awayGoalSilence`)
1. **Datamodell (`src/types/models.ts` & `src/data/defaults.ts`):**
   * `AppSettings` utökas med `awayGoalSilence: boolean;` (default: `true` i `DEFAULT_SETTINGS`).
   * `MatchProfile.settings` uppdateras så att även `awayGoalSilence` kan ingå:
     `Partial<Pick<AppSettings, 'duckVolume' | 'fadeOutDurationMs' | 'awayGoalSilence' | 'scriptTemplates' | 'keyBindings'>>`
2. **Domänlogik & Store (`src/utils/domain.ts` & `src/store/useAppStore.ts`):**
   * `sanitizeSettings`: `awayGoalSilence: typeof rawSettings.awayGoalSilence === 'boolean' ? rawSettings.awayGoalSilence : fallback.awayGoalSilence`.
   * `sanitizeMatchProfile`: sanerar `awayGoalSilence` om satt (`typeof rawSettings.awayGoalSilence === 'boolean'`).
   * `useAppStore.ts`: `saveCurrentAsMatchProfile` sparar `awayGoalSilence` i profilens `settings`, och `activateMatchProfile` tillämpar profilens `awayGoalSilence` (om definierad) vid profilväxling.
3. **Målflöde (`src/components/GoalFlowModal.tsx` & `src/App.tsx`):**
   * Vid öppning av `GoalFlowModal` (Steg 0):
     * `team.id === 'home'` -> anropar `onStartHomeGoalMusic()` direkt.
     * `team.id === 'away'`:
       * Om `settings.awayGoalSilence === true` -> ingen musik startas automatiskt (sportslig tystnad; knapp `STARTA OMSTART / PEPP-LÅT` finns i headern).
       * Om `settings.awayGoalSilence === false` -> anropar `onStartAwayRestartMusic()` automatiskt direkt vid öppning!
   * Vid övergång till Steg 2 (Talmanus): `enterScriptStep` duckar ljudet automatiskt om `isMusicPlaying || team.id === 'home' || !settings.awayGoalSilence`.
   * I `GoalFlowModal` när `team.id === 'away'`: informationsrutan visar aktivt läge (*"Sportslig tystnad vid bortamål. Använd knappen STARTA OMSTART / PEPP-LÅT ovan inför tekning vid behov."* respektive *"Automatisk musik vid bortamål är aktiverad — låt från omstartslistan startar direkt."*) samt har en direkt snabbknapp för att växla `awayGoalSilence` (`onToggleAwayGoalSilence`) direkt i modalen.
4. **Inställningsvy (`src/components/SetupView.tsx`):**
   * Under **Inställningar** finns en tydlig toggle/switch för **"Sportslig tystnad vid bortamål"** med förklarande beskrivning som gör det tydligt att man kan välja mellan *Sportslig tystnad* (`true`) och *Starta musik från listan direkt vid bortamål* (`false`).

### 4.2 Automatisk Import av Låttitel och Artist från Spotify-delningslänk
1. **L2 Ren Domänlogik (`src/utils/domain.ts`, helt fri från DOM/`window`/`localStorage`):**
   * **`extractSpotifyTrackId(input: string): string | null`:**
     * Extraherar exakt det 22-teckens alfanumeriska Spotify Track ID:t från `https://open.spotify.com/track/<id>?si=...`, `https://open.spotify.com/intl-xx/track/<id>?...` eller `spotify:track:<id>`. Returnerar `null` för ogiltiga strängar.
   * **`parseSpotifyMetadataPayload(payload: unknown): { title: string; artist: string } | null`:**
     * Deterministisk parsningsfunktion som stödjer samtliga tre format:
       1. **Spotify Web API `/v1/tracks/{id}`:** `{ name: string, artists: Array<{ name: string }> }` -> `{ title: name, artist: artists.map(a => a.name).join(', ') }`.
       2. **Redan normaliserat JSON-objekt:** `{ title: string, artist: string }` (t.ex. från `/api/spotify-meta`).
       3. **Spotify Embed `__NEXT_DATA__`:** `{ props: { pageProps: { state: { data: { entity: { name?: string, title?: string, subtitle?: string, artists?: Array<{ name: string }> } } } } } }` -> extraherar `title` (`entity.name || entity.title`) och `artist` (`entity.artists.map(a => a.name).join(', ') || entity.subtitle`).
       4. **Spotify Embed HTML-sträng:** Parsar ut `<script id="__NEXT_DATA__" type="application/json">...</script>` (och vid avsaknad fallback via HTML-avkodade `<title>... - song and lyrics by ... | Spotify</title>` eller `og:title` / `og:description`).
       5. **Spotify `/oembed`:** `{ title: string, author_name?: string }` -> om `title` är på formen `"Låttitel - Artist"` eller `"Låttitel by Artist"` delas den vid behov upp, och `author_name` används om artist saknas; annars returneras `{ title, artist: author_name || '' }`.
2. **L0 Vite Server-Middleware & Klienttjänst (`vite.config.ts` & `src/services/spotifyMetadata.ts`):**
   * **`vite.config.ts`:** Registrera en Vite-plugin med `configureServer` (och `configurePreviewServer` för preview) som hanterar `GET /api/spotify-meta?id=<trackId>`:
     * Validerar att `id` matchar `/^[A-Za-z0-9]{22}$/` (annars HTTP `400` `{ error: "Invalid track id" }`).
     * Hämtar server-side via Node `fetch` `https://open.spotify.com/embed/track/${trackId}` (med rimlig timeout, t.ex. 5000 ms, och `User-Agent`) och vid behov fallback till `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`.
     * Parsar via `parseSpotifyMetadataPayload` och returnerar HTTP `200` JSON `{ trackId, trackUri: "spotify:track:" + trackId, title, artist }`.
     * Calm Tech Guard: Vid nätverksfel eller timeout returneras kontrollerat JSON-svar (t.ex. HTTP `502` `{ error: ... }`) utan att Vite-processen någonsin kraschar.
   * **`src/services/spotifyMetadata.ts`:**
     * Exporterar `fetchSpotifyTrackMetadata(input: string, clientId?: string): Promise<{ trackUri: string; trackId: string; title: string; artist: string } | null>`:
       1. Extraherar `trackId` via `extractSpotifyTrackId(input)`. Returnerar `null` om ogiltig.
       2. **Steg 1 (Spotify Web API):** Om `getValidSpotifyAccessToken(clientId)` ger en token, hämta `https://api.spotify.com/v1/tracks/${trackId}` med `Authorization: Bearer <token>` och parsa via `parseSpotifyMetadataPayload`.
       3. **Steg 2 (Vite `/api/spotify-meta`):** Hämta `/api/spotify-meta?id=${encodeURIComponent(trackId)}` och parsa `{ title, artist }`.
       4. **Steg 3 (Direkt oEmbed fallback):** Hämta `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}` och parsa via `parseSpotifyMetadataPayload`.
     * Kastar aldrig ohämtade undantag ut i UI:t (Calm Tech).
3. **Automatisk Ifyllnad i Soundboard-editorn (`src/components/SetupView.tsx`):**
   * Både i **"Lägg till ny låt"**-formuläret och på **befintliga låtar** i `SoundPadEditor`:
     * När användaren klistrar in eller anger en giltig Spotify-länk/URI anropas `fetchSpotifyTrackMetadata` automatiskt (skyddad med request-token/senaste-input-ref mot race conditions).
     * Visar diskret laddnings-/statusindikator (`"Hämtar låttitel & artist..."` -> `"Hämtade: <Titel> – <Artist>"`).
     * Fyller automatiskt i `Titel` och `Artist` (även för användarens exempellänk `https://open.spotify.com/track/4QcBuV31ukMvsvviytKjWx?si=ccd5352978464589`), utan att krascha vid offline-läge.
     * Inkluderar dessutom en manuell knapp `[Hämta info]` bredvid Spotify-länkfältet på varje låt.

---

## 5. Oracle Contract (The Gate of Truth)
Verifieras av `Agent-Oracle` i Modul `07_oracle_away_goal_and_metadata` via `tests/test_unit_domain.py`, `tests/oracle_hockeyjockey.py` och `/home/ma-auto/DEV/bin/invoke-v2-gate` med `exit code 0` och `"overall_status": "VERIFIED"`.

---

## 6. Resursallokering & Sub-Agent Roster

| Roster-Profil | Tilldelad Modell & Tier (`models.json`) | Ansvarsområde |
| :--- | :--- | :--- |
| **`Agent-Logic`** | **Claude Sonnet 5.5 (Medium)** | Nivå 3 Custom Code för Modul 06 (`src/` och `vite.config.ts`). |

**Tilldelad Roster-Profil för denna modul:** `Agent-Logic`  
**Tilldelad Modell:** `Claude Sonnet 5.5 (Medium)`
