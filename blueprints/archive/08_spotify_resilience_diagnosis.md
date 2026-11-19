# Diagnostikrapport: 08_spotify_resilience (Agent-Lab)
Status: COMPLETE
Diagnostiker: Agent-Lab (Gemini 4 Neon (Medium))
Datum: 2026-11-19

---

## 1. Bakgrund & Problembeskrivning
Användaren rapporterade att **HockeyJockey** växlar över till / stannar i **Simulerat Läge** trots att Spotify Client ID lagts in och inloggning genomförts. `Agent-Lab` genomförde en strikt read-only-granskning av [spotifyAuth.ts](file:///home/ma-auto/DEV/HockeyJockey/src/services/spotifyAuth.ts), [spotifyPlayer.ts](file:///home/ma-auto/DEV/HockeyJockey/src/services/spotifyPlayer.ts), [audioController.ts](file:///home/ma-auto/DEV/HockeyJockey/src/services/audioController.ts), [App.tsx](file:///home/ma-auto/DEV/HockeyJockey/src/App.tsx) och [TopBar.tsx](file:///home/ma-auto/DEV/HockeyJockey/src/components/TopBar.tsx).

---

## 2. Identifierade Grundorsaker (Root Causes 1–6)

1. **Root Cause 1 – Avsaknad av Widevine DRM (EME `initialization_error`) på Linux & ingen Spotify Connect-fallback:**
   * Spotify Web Playback SDK kräver Widevine CDM (`com.widevine.alpha`). På Linux-webbläsare utan Widevine misslyckas EME-förhandlingen med `initialization_error` kort efter `player.connect()`. `this.ready` förblir `false` och `this.deviceId` förblir `null`. Trots att appens OAuth-scopes redan medger full fjärrstyrning via Spotify Connect (`GET /v1/me/player/devices`), kontrollerades aldrig externa aktiva Spotify-enheter (t.ex. Spotify Desktop-appen eller Web Player).
2. **Root Cause 2 – Envägsfälla (One-Way Latch) i `AudioController.playAt()`:**
   * Om användaren klickar på en låt innan SDK:n hunnit initiera (`ready` tar 1,5–4 s vid sidladdning), eller om ett enskilt API-anrop kastar HTTP `404`/`429`, faller `playAt()` direkt ned till `mode: 'simulated'` utan att försöka anropa `ensureReady()` eller återuppta Spotify-anslutningen.
3. **Root Cause 3 – Saknat `player.activateElement()`, Transfer Playback (`PUT /v1/me/player`) och återanslutning efter `authentication_error`/`not_ready`:**
   * Autoplay-blockering kan hindra SDK-uppspelning utan `activateElement()`, inaktiva enheter som returnerar HTTP `404` väcks inte automatiskt, och `authentication_error` förnyade bara token utan att återansluta spelaren.
4. **Root Cause 4 – Borttappat `clientId` mellan `defaultSpotifyAdapter` och `spotifyAuth.ts`:**
   * `defaultSpotifyAdapter.playTrack` utelämnade `clientId`, och `refreshSpotifyToken(undefined)` föll tillbaka på `''` istället för `DEFAULT_SPOTIFY_CLIENT_ID` (`35b681ec04634ec3a6a5083ce87216c4`).
5. **Root Cause 5 – Othrottlad 50 ms `setVolume`-ramp mot Spotify Web API:**
   * Vid fjärrstyrning via Web API kan täta 50 ms-anrop utlösa HTTP `429 Too Many Requests`.
6. **Root Cause 6 – UI-låsning i `TopBar.tsx` & `localhost` vs `127.0.0.1`-origin:**
   * När `isSpotifyAuthenticated` är `true` men `mode === 'simulated'` doldes anslutningsknappen och ingen knapp för **"Återanslut Spotify"** fanns tillgänglig. Vidare separeras `localStorage` om användaren råkar besöka `localhost:5173` istället för `127.0.0.1:5173`.

---

## 3. Kirurgiskt Åtgärdsrecept
Se specifikation och kontrakt i [08_spotify_resilience_init.md](file:///home/ma-auto/DEV/blueprints/HockeyJockey/08_spotify_resilience_init.md) (implementeras av `Agent-Logic` utan att bryta befintligt fallback-orakel i `tests/oracle_hockeyjockey.py`).
