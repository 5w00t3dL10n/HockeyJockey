# Blueprint: 08_spotify_resilience (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter instrueras att läsa denna fil exakt en gång vid uppstart och betrakta den som orubblig lag. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**. Om ett gränssnitt behöver ändras, MÅSTE agenten stanna, eskalera till Master Coordinator och invänta en uppdaterad blueprint.

---

## 1. Syfte & Strategiskt Mål
Göra Spotify-anslutningen i **HockeyJockey** självläkande och motståndskraftig mot Widevine DRM-begränsningar på Linux, tillfälliga 404/401/429-fel och laddnings-race conditions genom en **hybrid Web Playback SDK + automatisk Spotify Connect-fallback** samt en tydlig **"Återanslut Spotify"**-kontroll i UI:t.

---

## 2. Rollfördelning & Ansvarsområden
*   **Lead Architect (Master-agenten i ai-master-config):** Äger denna Sacred Truth-specifikation.
*   **`Agent-Logic` (`Claude Sonnet 5.5 (Medium)`):** Implementerar åtgärderna i `/home/ma-auto/DEV/HockeyJockey/src/` enligt diagnostikrapporten [08_spotify_resilience_diagnosis.md](file:///home/ma-auto/DEV/blueprints/HockeyJockey/08_spotify_resilience_diagnosis.md) utan att ändra `tests/` eller bryta befintligt fallback-orakel.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan uppgiften lösas med inbyggda terminalkommandon? | **Nej** |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt eftersom Nivå 3 väljs:* | Kräver asynkron Web Playback SDK + Spotify Connect REST API-orkestrering (`GET /v1/me/player/devices`, `PUT /v1/me/player`), EME-timeout-detektering, token-refresh-koalescering och throttlad volymstyrning i TypeScript/React. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `npm`, `tsc`, `vite`, `git`. |
| **Maskinberoende (Capabilities)** | Krävs specifika verktyg? | `node,npm,git,python` |
| **Gate Runner Integration** | Deterministiska kontroller | Stage 1: `npx tsc --noEmit`; full 5-stegsgrind exekveras i modul `09_oracle_spotify_resilience`. |

---

## 4. Sacred Truth (Design & Arkitektur)

### 4.1 `src/services/spotifyAuth.ts` — Alltid giltigt Client ID & Origin-skydd
1. Importera `DEFAULT_SPOTIFY_CLIENT_ID` från `../data/defaults.ts`.
2. I `getStoredSpotifyAuth`, `refreshSpotifyToken`, `getValidSpotifyAccessToken` och `scheduleProactiveRefresh`:
   * Lös alltid `clientId` med fallback-kedjan `clientIdOverride?.trim() || stored?.clientId?.trim() || DEFAULT_SPOTIFY_CLIENT_ID`.
   * Garanti: `refreshSpotifyToken` får aldrig misslyckas p.g.a. att `clientId` utelämnats av anroparen.
3. I `startSpotifyLogin` (webbläsarmiljö): om `window.location.hostname === 'localhost'` och `redirectUri` använder `127.0.0.1` på samma port, omdirigera först eller varna/normalisera så att PKCE-lagring alltid sker på samma origin (`127.0.0.1`). Lägg även till en hjälpfunktion `ensureConsistentLoopbackOrigin(redirectUri)` som i `App.tsx` säkert skickar användaren från `http://localhost:5173` till `http://127.0.0.1:5173` om `redirectUri` pekar mot `127.0.0.1`.

### 4.2 `src/services/spotifyPlayer.ts` — Hybrid Web Playback SDK + Spotify Connect Fallback
1. **Utökade typer & tillstånd:**
   * `SpotifyPlayerInstance` utökas med `activateElement?: () => Promise<void>;`.
   * `SpotifyPlayerCallbacks.onReady` utökas bakåtkompatibelt till `onReady?: (deviceId: string, deviceName?: string) => void;`.
   * `SpotifyPlayerService` spårar:
     * `transportMode: 'sdk' | 'connect'`
     * `deviceName: string | null`
     * `clientId: string` (default `DEFAULT_SPOTIFY_CLIENT_ID`)
   * Exporterar `getDeviceName(): string | null` och `getTransportMode(): 'sdk' | 'connect'`.
2. **Spotify Connect Remote Device Discovery (`discoverConnectDevice`):**
   * `public async discoverConnectDevice(clientId?: string): Promise<{ id: string; name: string } | null>`:
     * Hämtar giltig OAuth-token via `getValidSpotifyAccessToken(clientId || this.clientId)`. Om ingen token finns returneras `null`.
     * Anropar `GET https://api.spotify.com/v1/me/player/devices`.
     * Filtrerar tillgängliga enheter (`!d.is_restricted && typeof d.id === 'string' && d.id.length > 0`).
     * Väljer enhet i strikt prioritetsordning:
       1. Enhet med `is_active === true`
       2. Enhet med `name === SPOTIFY_PLAYER_NAME` (`"Hockey DJ Booth"`)
       3. Första tillgängliga enhet (t.ex. öppen Spotify Desktop-app, Spotify Web Player eller mobil)
     * Om en enhet hittas: sätter `this.transportMode = 'connect'`, `this.deviceId = chosen.id`, `this.deviceName = chosen.name`, `this.ready = true`, `this.lastError = null` och anropar `this.callbacks.onReady?.(chosen.id, chosen.name)`. Returnerar `{ id: chosen.id, name: chosen.name }`.
3. **Självläkande `connect()` & Fallback vid DRM/EME-fel:**
   * I `connect(clientId, initialVolume)`:
     * Sparar `this.clientId = clientId?.trim() || DEFAULT_SPOTIFY_CLIENT_ID`.
     * Om `loadSdkScript()` misslyckas eller `window.Spotify?.Player` saknas -> anropa `await this.discoverConnectDevice(this.clientId)` och returnera `true` om en Connect-enhet hittades.
     * Om SDK:n startas: använd en **ready-timeout på 2500 ms** och lyssna på `initialization_error`:
       * Om `initialization_error` inträffar (t.ex. saknad Widevine DRM på Linux) eller om `ready` inte triggas inom 2500 ms: försök automatiskt `await this.discoverConnectDevice(this.clientId)`!
       * Om `discoverConnectDevice` lyckas: tysta SDK-init-felet (ingen röd felbanner till användaren!) och kör vidare smidigt via Spotify Connect-enheten!
       * Om varken SDK eller någon Spotify Connect-enhet finns: sätt tydligt felmeddelande (`"Ingen aktiv Spotify-spelare hittades. Öppna Spotify-appen på datorn eller mobilen (eller aktivera Widevine DRM i webbläsaren) och klicka på Återanslut Spotify."`) och trigga `onError`.
     * Vid `authentication_error`: försök `await refreshSpotifyToken(this.clientId)` och om det lyckas, försök återansluta (`player.connect()` eller `discoverConnectDevice`).
     * Vid `not_ready`: försök automatiskt `await this.discoverConnectDevice(this.clientId)` innan `onNotReady` fäller ned till simulerat läge.
4. **Självläkande `ensureReady`, `playTrack`, `pause` & Throttlad `setVolume`:**
   * `public async ensureReady(clientId?: string): Promise<boolean>`:
     * Om `this.isReady()` är `true`, returnera `true`.
     * Kontrollera giltig token; om token finns, försök `await this.discoverConnectDevice(clientId || this.clientId)`. Om ingen enhet hittades, returnera `false`.
   * `playTrack(trackUri, positionMs, clientId?)`:
     * Anropa `await this.player?.activateElement?.().catch(() => {})` om SDK-spelare existerar.
     * Om `!this.isReady()`, anropa `await this.ensureReady(clientId)`. Om fortfarande inte redo, kasta tydligt fel.
     * Skicka `PUT https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(this.deviceId)}`.
     * Vid HTTP `401`: förnya token och försök igen.
     * Vid HTTP `404` (inaktiv eller sömnig enhet):
       1. Försök väcka enheten via `PUT https://api.spotify.com/v1/me/player` med `{ device_ids: [this.deviceId], play: false }`, ELLER kör `discoverConnectDevice(clientId)` för att hitta aktuell aktiv enhet.
       2. Försök `PUT /v1/me/player/play?device_id=...` en gång till!
   * `pause()`:
     * Om `this.transportMode === 'sdk'` och `this.player` finns: `await this.player.pause()`.
     * Annars (i `'connect'`-läge): skicka `PUT https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(this.deviceId)}` med giltig OAuth-token.
   * `setVolume(volume)`:
     * Om `this.transportMode === 'sdk'` och `this.player` finns: `await this.player.setVolume(clamped)`.
     * Annars (i `'connect'`-läge): skicka `PUT https://api.spotify.com/v1/me/player/volume?volume_percent=${Math.round(clamped * 100)}&device_id=${encodeURIComponent(this.deviceId)}` **throttlat till max 1 anrop per 180 ms** (coalesced så att mellanliggande ramp-värden inte spammar HTTP 429, medan det absolut sista målvolymvärdet alltid garanteras att skickas!).

### 4.3 `src/services/audioController.ts` — Bevarat Orakelkontrakt + `ensureReady`
1. `AudioTransportAdapter` utökas med **valfria** fält:
   * `ensureReady?: () => Promise<boolean>;`
   * `getDeviceName?: () => string | null;`
   *(Krav för orakelkompatibilitet: fälten MÅSTE vara valfria så att befintliga isolerade tester med `customFailingAdapter` utan `ensureReady` fortsätter att bete sig exakt som förväntat).*
2. `defaultSpotifyAdapter` binder `ensureReady: () => spotifyPlayerService.ensureReady()` och `getDeviceName: () => spotifyPlayerService.getDeviceName()`.
3. `setSpotifyConnected(deviceId: string, deviceName?: string)`: sätter `deviceName: deviceName || 'Hockey DJ Booth'` och `statusMessage: 'Spotify Ansluten (' + (deviceName || 'Hockey DJ Booth') + ')'`.
4. `playAt(...)`:
   * Om `!this.adapter.isReady()` och `this.adapter.ensureReady` finns: anropa `await this.adapter.ensureReady()`.
   * Kontrollera därefter `this.adapter.isReady()`. Om `true`, spela upp via `this.adapter.playTrack(...)`, uppdatera `mode: 'spotify'`, `deviceId: this.adapter.getDeviceId()`, `deviceName: this.adapter.getDeviceName?.() || this.state.deviceName`, `statusMessage` och `error: null`.
   * Om `playTrack` ändå kastar ett permanent fel: behåll nuvarande Calm Tech-fallback (`mode: 'simulated'`, `isPlaying: true`, `statusMessage: 'Simulerat Läge (Spotify fallback)'`, `error: message`).

### 4.4 `src/App.tsx` & `src/components/TopBar.tsx` — Återanslutningsknapp & Lugna Statusmeddelanden
1. I `App.tsx`:
   * `ensureConsistentLoopbackOrigin(settings.spotifyRedirectUri)` vid uppstart.
   * `onReady: (deviceId, deviceName) => audioController.setSpotifyConnected(deviceId, deviceName)` + rensning av eventuell gammal init-varning i `bannerMessage`.
   * I `connectSpotifySdk`: om `spotifyPlayerService.connect(...)` returnerar `false` trots inloggning, visa ett hjälpsamt meddelande och håll `audioController` i simulerat läge utan att låsa användaren ute.
   * Skicka prop `onReconnectSpotify={() => void connectSpotifySdk()}` till `TopBar`.
2. I `TopBar.tsx`:
   * När `isSpotifyAuthenticated === true` och `audioState.mode === 'simulated'`: visa knappen **`Återanslut Spotify`** bredvid `Logga ut`, så att användaren med ett klick kan ansluta till en nyöppnad Spotify Desktop/Web/Mobil-enhet eller återansluta spelaren utan att behöva logga ut.
   * När `audioState.mode === 'spotify'`, visa aktiv enhetsnamn tydligt i badgen (t.ex. `Spotify: Hockey DJ Booth` eller `Spotify: <Datornamn>`).

---

## 5. Oracle Contract (The Gate of Truth)
Verifieras av `Agent-Oracle` i Modul `09_oracle_spotify_resilience` via `tests/oracle_hockeyjockey.py` och `/home/ma-auto/DEV/bin/invoke-v2-gate` med `exit code 0` och `"overall_status": "VERIFIED"`.

---

## 6. Resursallokering & Sub-Agent Roster

| Roster-Profil | Tilldelad Modell & Tier (`models.json`) | Ansvarsområde |
| :--- | :--- | :--- |
| **`Agent-Logic`** | **Claude Sonnet 5.5 (Medium)** | Nivå 3 Custom Code för Modul 08 (`src/`). |

**Tilldelad Roster-Profil för denna modul:** `Agent-Logic`  
**Tilldelad Modell:** `Claude Sonnet 5.5 (Medium)`
