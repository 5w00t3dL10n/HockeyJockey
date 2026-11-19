# Task: 08_spotify_resilience (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-Logic
Tilldelad Modell & Tier: Claude Sonnet 5.5 (Medium)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail (Mental Självverifiering)

> [!CAUTION]
> **TILLSTÅNDSLÅSNING FÖR SUB-AGENTEN:**  
> 1. *"Jag agerar i rollen som Agent-Logic med tilldelad modell Claude Sonnet 5.5 (Medium)."*
> 2. *"Jag har READ-ONLY tillgång till `08_spotify_resilience_init.md` och får ALDRIG ändra den."*
> 3. *"Jag modifierar endast filer under `/home/ma-auto/DEV/HockeyJockey/src/` autonomt via filverktyg (inga kodblock i chatten)."*
> 4. *"Jag respekterar befintligt fallback-orakel i `tests/oracle_hockeyjockey.py` (`ensureReady` är valfri på `AudioTransportAdapter` och kastat permanent fel i `playTrack` faller fortsatt tillbaka till `'simulated'`)."*
> 5. *"Jag rör INTE `tests/` och avslutar med `npx tsc --noEmit` samt `npm run build` (exit code 0)."*

---

## 2. Exekveringssteg

### Fas 1: Förberedelser
- [ ] **Läs Sacred Truth:** Läs `/home/ma-auto/DEV/blueprints/HockeyJockey/08_spotify_resilience_init.md`, `08_spotify_resilience_diagnosis.md`, `src/services/spotifyAuth.ts`, `src/services/spotifyPlayer.ts`, `src/services/audioController.ts`, `src/App.tsx` och `src/components/TopBar.tsx`.
- [ ] **Städa eventuell scratch-fil:** Om `scratch/reproduce_simulated_mode.ts` skapades i `/home/ma-auto/DEV/HockeyJockey/scratch/`, ta bort den efter kontroll (så arbetsytan är ren).

### Fas 2: Implementering
- [ ] **`src/services/spotifyAuth.ts`:** Garantera fallback till `DEFAULT_SPOTIFY_CLIENT_ID` i alla token-funktioner samt lägg till `ensureConsistentLoopbackOrigin`.
- [ ] **`src/services/spotifyPlayer.ts`:** Implementera hybrid Web Playback SDK + automatisk Spotify Connect-discovery (`discoverConnectDevice`), `activateElement`, 2500 ms SDK-init timeout + `initialization_error`-fallback, 404 Transfer/Connect-retry i `playTrack`, `pause` och throttlad `setVolume` i `'connect'`-läge samt `ensureReady`, `getDeviceName`, `getTransportMode`.
- [ ] **`src/services/audioController.ts`:** Lägg till valfria `ensureReady` och `getDeviceName` på `AudioTransportAdapter`, auto-återanslutning i `playAt()` före simulerad fallback, samt dynamiskt `deviceName` i `setSpotifyConnected`.
- [ ] **`src/App.tsx` & `src/components/TopBar.tsx`:** Koppla `ensureConsistentLoopbackOrigin`, `onReady(deviceId, deviceName)`, tyst hantering av övergång till Connect-enhet, enhetens namn i statusbadgen samt **"Återanslut Spotify"**-knapp i `TopBar.tsx` när inloggad i simulerat läge.

### Fas 3: Verifiering
- [ ] **Typcheck:** `npx tsc --noEmit` returnerar exit code `0`.
- [ ] **Bygge:** `npm run build` returnerar exit code `0`.

---

## 3. Acceptanskriterier
1. Samtliga ändringar i `08_spotify_resilience_init.md` är implementerade i `src/`.
2. `npx tsc --noEmit` och `npm run build` passerar med `0` fel.
3. Endast verifierade filvägar och byggresultat rapporteras (inga kodblock i chatten).
