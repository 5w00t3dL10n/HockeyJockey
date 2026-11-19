# Blueprint: 02_hockey_dj_app (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter instrueras att läsa denna fil exakt en gång vid uppstart och betrakta den som orubblig lag. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**. Om ett databasschema eller ett API-gränssnitt behöver ändras, MÅSTE agenten stanna, eskalera till Master Coordinator och invänta en uppdaterad blueprint.

---

## 1. Syfte & Strategiskt Mål
Implementera hela webbapplikationen **Hockey DJ & Speaker Assistant** i `/home/ma-auto/DEV/HockeyJockey` i enlighet med kravspecifikationen [teknisk_specifikation_hockey_dj_speaker_assistant.md](file:///home/ma-auto/DEV/HockeyJockey/teknisk_specifikation_hockey_dj_speaker_assistant.md). Applikationen förenar en låg-latens Spotify Web Playback SDK-soundboard (med sömlös lokal Web Audio-fallback när Spotify inte är anslutet) med interaktiva talstödsflöden (teleprompter) för utvisningar och mål.

---

## 2. Rollfördelning & Ansvarsområden (Who Does What)
*   **Dirigenten (Människan/Kaptenen):**
    *   Tillhandahåller Spotify Client ID och Spotify Premium-konto vid live-drift i ishallen.
*   **Lead Architect (Master-agenten i ai-master-config):**
    *   Äger denna Sacred Truth-specifikation och utvärderar arkitekturefterlevnad.
*   **Specialiserad Sub-Agent (`Agent-Logic` — `Claude Sonnet 5.5 (Medium)`):**
    *   Implementerar all TypeScript/React-källkod under `src/` autonomt via filverktyg (No-Code-in-Chat) i Sandbox Mode. Rör ALDRIG denna `_init.md`-fil och skapar inga testorakel under `tests/` (dessa ägs av `Agent-Oracle`).

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan uppgiften lösas med inbyggda terminalkommandon (Bash/PowerShell)? | **Nej** |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt eftersom Nivå 3 väljs:* Varför räcker inte OS-Native terminalkommandon för uppgiften? | Uppgiften kräver en interaktiv klientbaserad SPA i React + TypeScript med OAuth 2.0 PKCE-kryptografi (SHA-256 + Base64URL), realtidsintegration mot Spotify Web Playback SDK och Web API, stegvis ljudinterpolering i 50 ms-intervall (`AudioController`), tillståndshantering i `localStorage`/Zustand, skräddarsydda SVG-domartecken samt tangenbords- och touch-styrd teleprompter-state machine. Detta kan omöjligt lösas med OS-nativa terminalkommandon. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg i stacken? | **Ja** – `npm`, `vite`, `tsc`, `git` används för byggnation, typcheck och versionshantering. |
| **Maskinberoende (Capabilities)** | Kräver uppgiften verktyg som kanske saknas på vissa noder? | `node,npm,git,python` |
| **Gate Runner Integration** | Vilka deterministiska kommandon ska bindas till Stage 0–4? | Stage 1 verifieras med `npx tsc --noEmit`; full 5-stegsgrind exekveras i modul 03 via `invoke-v2-gate`. |

---

## 4. Sacred Truth (Design & Arkitektur)

### 4.1 Lagertillhörighet & Calm Technology
*   **L0 Transport (`src/services/`):**
    *   `src/services/spotifyAuth.ts`: Spotify OAuth 2.0 PKCE-flöde (`https://accounts.spotify.com/authorize` och `https://accounts.spotify.com/api/token`), scopes `streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state`, hantering av `/callback`-redirect (`code` -> `access_token` + `refresh_token`), automatisk proaktiv token-förnyelse före utgångstid och säker lagring i `localStorage` (`hockey_dj_spotify_auth`).
    *   `src/services/spotifyPlayer.ts`: Dynamisk inladdning och initiering av Spotify Web Playback SDK (`window.Spotify.Player`, enhetsnamn `"Hockey DJ Booth"`), lyssnare för `ready`, `not_ready`, `player_state_changed`, `initialization_error`, `authentication_error`, `account_error`, samt REST-anrop `PUT https://api.spotify.com/v1/me/player/play?device_id={id}` med payload `{ "uris": ["spotify:track:{trackId}"], "position_ms": positionMs }`.
    *   `src/services/audioController.ts`: Dedikerad ljudmotor (`AudioController`) som kapslar både Spotify-spelaren och en **Calm Tech Fallback / Simulerad Web Audio-motor**:
        *   Om Spotify SDK inte är ansluten eller autentisering saknas växlar motorn tyst till lokalt Web Audio / simuleringsläge (med valfri mjuk hörbar synth-preview eller tyst timer-state i headless-miljö) och exponerar tydlig anslutningsstatus i UI utan krascher eller blockerande felmodaler.
        *   Följande metoder med exakta tidssteg MÅSTE implementeras:
            1. `playAt(trackUri: string, positionMs: number, targetVolume?: number, previewMs?: number): Promise<void>` — Återställer/sätter målvolym (default `1.0`), startar uppspelning från `positionMs`, och om `previewMs` anges (t.ex. `5000` för `[PROVSPELA 5 SEK]`) schemaläggs automatisk `fadeOutAndPause` efter `previewMs`.
            2. `duckVolume(targetDuckVolume?: number, durationMs?: number): Promise<void>` — Sänker mjukt volymen från nuvarande nivå till `targetDuckVolume` (default `0.20`) över `durationMs` (default `400` ms) i `50 ms`-steg (`calculateVolumeSteps`).
            3. `restoreVolume(targetVolume?: number, durationMs?: number): Promise<void>` — Höjer mjukt volymen tillbaka till `targetVolume` (default `1.0`) över `durationMs` (default `400` ms) i `50 ms`-steg.
            4. `fadeOutAndPause(durationMs?: number): Promise<void>` — Sänker volymen stegvis ned till `0.0` över `durationMs` (default `600` ms) i `50 ms`-steg och anropar därefter `pause()`.
            5. `hardStop(): Promise<void>` — Avbryter pågående ramp-timers omedelbart och exekverar `pause()` utan fördröjning.
            6. `setVolumeImmediate(volume: number): Promise<void>` — Direkt volymjustering från topplistens reglage.
        *   **Concurrency Guard:** Endast en aktiv volymramp (`duck`/`restore`/`fade`) får löpa åt gången; en ny ramp eller `hardStop`/`playAt` avbryter omedelbart föregående ramp-intervall för att undvika race conditions.

### 4.2 Datastruktur & Scheman (`src/types/models.ts`, `src/data/`)
Följande TypeScript-gränssnitt utgör låst kontrakt enligt specifikationens kapitel 5 och MÅSTE exporteras från `src/types/models.ts`:

```typescript
export interface Player {
  number: string; // String för att hantera ev. "00" eller ledande nollor
  name: string;
}

export interface Team {
  id: 'home' | 'away';
  name: string;
  color: string; // Hex-kod för visuell tydlighet i UI
  roster: Record<string, string>; // Key: tröjnummer, Value: spelarnamn
}

export interface TrackCue {
  trackUri: string; // "spotify:track:..."
  title: string;
  artist: string;
  startTimeMs: number;
}

export type PadCategory =
  | 'goal_home'
  | 'goal_away'
  | 'penalty_home'
  | 'penalty_away'
  | 'faceoff_off'
  | 'faceoff_def'
  | 'hype'
  | 'organ'
  | 'misc';

export interface SoundPad {
  id: string;
  label: string;
  category: PadCategory;
  color: string;
  tracks: TrackCue[]; // En eller flera låtar (roteras om > 1)
  lastPlayedIndex?: number;
  volume?: number; // Default 1.0
  triggerFlow?: 'penalty_home' | 'penalty_away' | 'goal_home' | 'goal_away' | null;
}

export interface PenaltyDefinition {
  id: string;
  labelSv: string; // T.ex. "Ruffing"
  labelEn: string; // T.ex. "Roughing"
  iconKey: string; // Referens till SVG-komponent
}

export interface AppSettings {
  duckVolume: number; // T.ex. 0.2
  fadeOutDurationMs: number; // T.ex. 600
  spotifyClientId: string;
  spotifyRedirectUri: string;
  scriptTemplates: {
    penalty: string; // "{team} drar på sig en utvisning genom nummer {number}, {name}, {duration} för {reason}."
    penaltyTeam: string; // "Lagstraff för {team}, {duration} för {reason}."
    goal: string; // "Mål för {team}! Målskytt nummer {scorerNumber}, {scorerName}."
    goalWithAssist: string; // "Mål för {team}! Målskytt nummer {scorerNumber}, {scorerName}. Framspelad av {assists}."
  };
}
```

*   **Standardutvisningar (`src/data/penalties.ts`):** Måste innehålla alla 13 specificerade förseelser med unika `id`, `labelSv`, `labelEn` och `iconKey`:
    1. `tripping` — `Tripping` / `Tripping`
    2. `slashing` — `Slashing` / `Slashing`
    3. `hooking` — `Hooking` / `Hooking`
    4. `holding` — `Holding` / `Holding`
    5. `roughing` — `Ruffing` / `Roughing`
    6. `interference` — `Interference` / `Interference`
    7. `high_sticking` — `High-sticking` / `High-sticking`
    8. `boarding` — `Boarding` / `Boarding`
    9. `cross_checking` — `Cross-checking` / `Cross-checking`
    10. `charging` — `Charging` / `Charging`
    11. `checking_from_behind` — `Checking from behind` / `Checking from behind`
    12. `too_many_men` — `För många spelare` / `Too many men`
    13. `delay_of_game` — `Delay of game` / `Delay of game`
*   **Persistens & Export/Import (`src/store/useAppStore.ts`):**
    *   Zustand-store med automatisk `localStorage`-persistens (nyckel `hockey_dj_state_v1`, lagrar `teams`, `soundPads`, `settings`).
    *   Idempotent schema-validering vid laddning och JSON-import (`parseMatchConfigJson`, `serializeMatchConfigJson`) så att korrupt eller ofullständig JSON aldrig kraschar applikationen.

### 4.3 L2 Domänlogik (`src/utils/domain.ts`)
Alla rena beräkningar och parsningar placeras i `src/utils/domain.ts` (utan React- eller DOM-beroenden, så att de är direkt körbara i Node/TSX och Vitest):
*   `parseSpotifyUri(input: string): string` — Stöder `spotify:track:<22-char-id>`, `https://open.spotify.com/track/<id>?...` och `https://open.spotify.com/intl-xx/track/<id>?...`. Returnerar `spotify:track:<id>` eller kastar tydligt valideringsfel / returnerar validerat resultat enligt helper `tryParseSpotifyUri`.
*   `parseTimeMmSsToMs(mmss: string): number` — Tolkar `"MM:SS"` eller `"M:SS"` till millisekunder (`"00:45"` -> `45000`, `"02:15"` -> `135000`). Skyddar mot negativa tal, ogiltiga sekunder (`>= 60`) och `NaN` (returnerar `0` eller kastar vid strikt validering — tillhandahåll både `parseTimeMmSsToMs` med safe-clamp/throw och `isValidMmSs`).
*   `formatMsToMmSs(ms: number): string` — Formaterar millisekunder till `"MM:SS"` (`45000` -> `"00:45"`). Hanterar negativa värden och `NaN` säkert (`"00:00"`).
*   `parseRosterText(text: string): Record<string, string>` — Parsar flerradig text (t.ex. `"22 Rasmus Karlsson"`, `"00 Målvakt"`, `"#14 - Erik Svensson"`, `"7, Anna Berg"`) och bevarar ledande nollor i tröjnummer.
*   `selectNextTrack(pad: SoundPad): { track: TrackCue | null; nextIndex: number }` — Cyklisk rotation genom `pad.tracks`: om `lastPlayedIndex` är `undefined` väljs index `0`; annars `(lastPlayedIndex + 1) % pad.tracks.length`.
*   `calculateVolumeSteps(fromVolume: number, toVolume: number, durationMs: number, intervalMs?: number): number[]` — Returnerar stegvektor av klampade volymer `[0.0, 1.0]` för linjär interpolering. Med `from=1.0, to=0.2, duration=400, interval=50` genereras exakt 8 steg där sista steget är `0.2`. Med `from=1.0, to=0.0, duration=600, interval=50` genereras exakt 12 steg där sista steget är `0.0`. Nolldivisionsskydd om `durationMs <= 0` eller `intervalMs <= 0` -> `[clamp(toVolume)]`.
*   `generatePenaltyScript(settings: AppSettings, params: { teamName: string; penaltyLabel: string; duration: string; playerNumber?: string; playerName?: string; isTeamPenalty?: boolean }): string`
*   `generateGoalScript(settings: AppSettings, params: { teamName: string; scorerNumber: string; scorerName?: string; assists?: Array<{ number: string; name?: string }> }): string`
*   `generatePkceVerifier(length?: number): string` och `generatePkceChallenge(verifier: string): Promise<string>` (använder Web Crypto `crypto.subtle.digest('SHA-256', ...)` + Base64URL utan padding `=`, kompatibel med både webbläsare och Node.js 22).
*   `exportMatchConfig(state: MatchConfigSnapshot): string` och `importMatchConfig(jsonString: string): MatchConfigSnapshot` (validerar och sanerar `teams`, `soundPads` och `settings`).

### 4.4 L3 Gränssnitt (`src/components/` & `src/hooks/`)
*   **Visuell identitet:** Dark Mode som standard (`slate-950` bakgrund, hög kontrast). Tydlig färgkodning: Hemmalag (blå/grön, t.ex. `#2563eb`) och Bortalag (orange/röd, t.ex. `#ea580c`). Minsta klickyta på match- och händelseknappar ska vara `min-w-[80px] min-h-[80px]` (gärna större på händelsekort).
*   **Topplist (`src/components/TopBar.tsx`):**
    *   Spotify-anslutningsstatus (indikator för `Spotify Ansluten` / `Simulerat Läge` + knapp för `Anslut Spotify` / `Logga ut`).
    *   Nuvarande låt (titel, artist, position) & interaktivt volymreglage (`0–100 %`).
    *   Växlare mellan **Matchläge** och **Förberedelseläge**.
    *   Globala kontroller alltid synliga:
        *   `[FADE OUT / SLÄPP PUCK]` (kopplad till `Space`)
        *   `[TVÄRSTOPP]` (röd knapp, kopplad till `Shift + Space`)
        *   `[DUCKA / PRATA]` (toggle till `settings.duckVolume` / 20 %, kopplad till `D`)
*   **Matchläge (`src/components/MatchView.tsx`):**
    *   **Händelseknappar (Triggers med Talstöd):** `MÅL HEMMALAG`, `MÅL BORTALAG`, `UTVISNING HEMMALAG (Boxplay)`, `UTVISNING BORTALAG (Powerplay)`.
    *   **Snabbknappar / Soundboard:** Rutnät med konfigurerbara knappar grupperade per kategori: *Tekning Anfallszon* (`faceoff_off`), *Tekning Försvarszon* (`faceoff_def`), *Pepp / Underläge* (`hype`), *Orgel / Publikpepp* (`organ`), *Timeout / Paus / Skada* (`misc`). Visar antal låtar i poolen och nästa/aktiv låt.
*   **Flöde A: Utvisning (`src/components/PenaltyFlowModal.tsx`):**
    *   *Steg 0 (Vid öppning):* Startar omedelbart vald utvisningslåt (`penalty_home` / `penalty_away`) vid `startTimeMs` på `1.0` volym.
    *   *Steg 1 (Spelarnummer):* Stor touch-vänlig numpad (`0–9`, `Sudda`, `Nästa`), live rosteruppslag (visar t.ex. `#22 – Rasmus Karlsson` eller `"Nummer ej i trupp – fortsätt ändå"`), samt knapp för `"Lagstraff"`.
    *   *Steg 2 (Domartecken & Tid):* Snabbval för tid (förvalt `2 minuter`, övriga: `2+2 minuter`, `5 minuter`, `10 minuter`) + visuellt rutnät med alla 13 domartecken med SVG-ikoner (`src/components/RefereeIcons.tsx`) + svensk & engelsk etikett. Klick på domartecken tar användaren direkt till Steg 3.
    *   *Steg 3 (Talmanus / Teleprompter):* Musiken **duckas automatiskt** (`duckVolume`). Visar genererat talmanus i mycket stor, kontraststark typografi. Action-knappar längst ner: `[HÖJ MUSIKEN]`, `[KLAR / FADE OUT]`, `[KLAR / BEHÅLL MUSIK]`.
*   **Flöde B: Mål (`src/components/GoalFlowModal.tsx`):**
    *   *Steg 0 (Vid öppning):* Om `home`: startar omedelbart mållåten (`goal_home`) på förinställd `startTimeMs`. Om `away`: **ingen musik startas automatiskt**, men en knapp `[STARTA OMSTART / PEPP-LÅT]` finns tillgänglig i modalen.
    *   *Steg 1 (Målskytt & Assist):* Touch-numpad med live rosteruppslag för Målskytt -> Assist 1 -> Assist 2, med tydlig genväg `[INGEN ASSIST / GÅ TILL MANUS]` (och `[KLAR / GÅ TILL MANUS]` efter Assist 1).
    *   *Steg 2 (Talmanus / Teleprompter):* Visar talmanus i mycket stor typografi. Har automatisk ducking vid inträde till manuset samt tydliga knappar `[DUCKA & PRATA]` / `[HÖJ MUSIKEN]` (så speakern vid behov kan höja för mål-firande och sedan ducka) och `[KLAR / FADE OUT]` / `[KLAR / BEHÅLL MUSIK]`.
*   **Förberedelseläge (`src/components/SetupView.tsx`):**
    *   **Roster Manager:** Redigera namn och färg för Hemmalag & Bortalag, lägg till/redigera/ta bort spelare, samt **Snabbimport** via textruta.
    *   **Soundboard-konfiguration:** Skapa, redigera, ta bort, byt ordning (flytta upp/ner) på knappar; lägg till/ta bort låtar i knappens pool; klistra in Spotify-länk (auto-konverterar till `spotify:track:...`); ange starttid i `MM:SS` (auto-konverteras till `ms`); välj färg & kategori; samt `[PROVSPELA 5 SEK]`-knapp.
    *   **Spotify & Allmänna Inställningar + Backup:** Konfigurera `spotifyClientId`, `spotifyRedirectUri`, `duckVolume`, `fadeOutDurationMs`, redigera talmanusmallar, samt knappar för `Exportera konfiguration (.json)` och `Importera konfiguration (.json)`.
*   **Tangentbordsgenvägar (`src/hooks/useKeyboardShortcuts.ts`):**
    *   Globala (när inget `input`, `textarea` eller `select` är fokuserat): `Space` (Mjuk Fade-Out & Pausa), `Shift + Space` (Tvärstopp), `D` (Toggle Audio Ducking).
    *   Modala (när Utvisnings- eller Målmodal är öppen): `0–9` (mata in siffra i numpad), `Backspace` (sudda), `Enter` (nästa steg / bekräfta), `Escape` (avbryt/stäng aktivt talstödsflöde **utan** att stänga av musiken).

### 4.5 Kvantifierade Verklighetsgrindar
1. `duckVolume` med default-parametrar (`400 ms`, `50 ms` intervall) ger exakt 8 steg till `0.20`.
2. `fadeOutAndPause` med default-parametrar (`600 ms`, `50 ms` intervall) ger exakt 12 steg ned till `0.0` följt av pause.
3. Nolldivisionsskydd: `calculateVolumeSteps` och `formatMsToMmSs` får aldrig producera `NaN` eller `Infinity`.
4. Touch-krav: Match- och händelseknappar använder minsta storlek `80x80px` (`min-h-[80px] min-w-[80px]`).

---

## 5. Oracle Contract (The Gate of Truth)
Denna modul verifieras efter fullbordad implementation av `Agent-Oracle` i Modul 03 (`03_oracle_and_gate`) via:
*   `tests/test_unit_domain.py` (Stage 2)
*   `tests/oracle_hockeyjockey.py` (Stage 4)
*   `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"`

---

## 6. Resursallokering & Sub-Agent Roster (Triage-Resultat)

| Roster-Profil | Tilldelad Modell & Tier (`models.json`) | Ansvarsområde i Denna Modul |
| :--- | :--- | :--- |
| **`Agent-Logic`** | **Claude Sonnet 5.5 (Medium)** | Nivå 3 Custom Code: implementation av `src/types/`, `src/data/`, `src/utils/`, `src/services/`, `src/store/`, `src/hooks/` och `src/components/`. *(Fallback: Gemini 4 Neon (Medium))* |

**Tilldelad Roster-Profil för denna modul:** `Agent-Logic`  
**Tilldelad Modell:** `Claude Sonnet 5.5 (Medium)`
