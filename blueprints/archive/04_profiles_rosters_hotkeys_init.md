# Blueprint: 04_profiles_rosters_hotkeys (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter instrueras att läsa denna fil exakt en gång vid uppstart och betrakta den som orubblig lag. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**. Om ett gränssnitt behöver ändras, MÅSTE agenten stanna, eskalera till Master Coordinator och invänta en uppdaterad blueprint.

---

## 1. Syfte & Strategiskt Mål
Utöka **HockeyJockey** med tre nya kärnfunktioner för snabb och flexibel drift i matchsekretariatet:
1. **Anpassningsbara Snabbkommandon (`KeyBindings`):** Möjlighet i Inställningar/Setup och per Soundboard-knapp att interaktivt binda valfria tangenter/tangentkombinationer till alla matchfunktioner och ljudknappar med automatisk konflikthantering.
2. **Matchprofiler (`MatchProfile`):** Spara, duplicera, uppdatera och snabbväxla kompletta matchprofiler med valda låtar, ljudknappar, kortkommandon och inställningar för olika åldersgrupper eller klubbar (t.ex. U12 vs Junior/A-lag).
3. **Roster-bibliotek (`SavedRoster`):** Spara, hantera och ladda valfritt antal sparade laguppställningar till antingen Hemmalag eller Bortalag.
4. **Standard-Client ID:** Förifyllt Spotify Client ID (`35b681ec04634ec3a6a5083ce87216c4`) som standardvärde i `DEFAULT_SETTINGS` och fallback vid tomt värde i `sanitizeSettings`.

---

## 2. Rollfördelning & Ansvarsområden (Who Does What)
*   **Dirigenten (Människan/Kaptenen):**
    *   Har efterfrågat snabbkommandon, matchprofiler och roster-bibliotek för enkel hantering av flera lag och åldersgrupper.
*   **Lead Architect (Master-agenten i ai-master-config):**
    *   Äger denna Sacred Truth-specifikation. Rör ingen delprojekt-källkod direkt.
*   **Specialiserad Sub-Agent (`Agent-Logic` — `Claude Sonnet 5.5 (Medium)`):**
    *   Implementerar utökningen i `/home/ma-auto/DEV/HockeyJockey/src/` autonomt via filverktyg i Sandbox Mode. Rör ALDRIG denna `_init.md`-fil eller `tests/` (som ägs av `Agent-Oracle`).

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan uppgiften lösas med inbyggda terminalkommandon? | **Nej** |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt eftersom Nivå 3 väljs:* Varför räcker inte OS-Native? | Interaktiv tangentbordsinspelning i webbläsaren, normalisering av tangentkombinationer, deterministisk konfliktdetektering, samt tillstånds- och bibliotekshantering för multipla matchprofiler och laguppställningar i React/Zustand/`localStorage` kan inte lösas med OS-nativa terminalkommandon. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg i stacken? | **Ja** – `npm`, `tsc`, `vite`, `git`. |
| **Maskinberoende (Capabilities)** | Kräver uppgiften verktyg som kanske saknas? | `node,npm,git,python` |
| **Gate Runner Integration** | Deterministiska kontroller | Stage 1: `npx tsc --noEmit`; full 5-stegsgrind exekveras i modul `05_oracle_profiles_hotkeys` via `invoke-v2-gate`. |

---

## 4. Sacred Truth (Design & Arkitektur)

### 4.1 Utökade Datamodeller (`src/types/models.ts`)
Alla befintliga typer (`Player`, `Team`, `TrackCue`, `PadCategory`, `SoundPad`, `PenaltyDefinition`, `AppSettings`, `MatchConfigSnapshot`, etc.) bevaras bakåtkompatibelt och utökas med:

1. **`MatchActionId` & `KeyBindings`:**
```typescript
export type MatchActionId =
  | 'fadeOut'
  | 'hardStop'
  | 'toggleDuck'
  | 'goalHome'
  | 'goalAway'
  | 'penaltyHome'
  | 'penaltyAway';

export interface KeyBindings {
  actions: Record<MatchActionId, string>;
  pads: Record<string, string>;
}
```
*   `SoundPad` får valfritt fält `hotkey?: string;` som hålls synkroniserat med `settings.keyBindings.pads[pad.id]`.
*   `AppSettings` utökas med `keyBindings: KeyBindings;` (och `spotifyClientId` med standardvärde `'35b681ec04634ec3a6a5083ce87216c4'`).

2. **`SavedRoster` (Laguppställningsbibliotek):**
```typescript
export interface SavedRoster {
  id: string;
  name: string;
  teamName: string;
  color: string;
  ageGroupOrClub?: string;
  roster: Record<string, string>;
  updatedAt: string;
}
```

3. **`MatchProfile` (Sparade Matchprofiler):**
```typescript
export interface MatchProfile {
  id: string;
  name: string;
  clubOrAgeGroup?: string;
  soundPads: SoundPad[];
  teams?: {
    home: Team;
    away: Team;
  };
  settings?: Partial<
    Pick<AppSettings, 'duckVolume' | 'fadeOutDurationMs' | 'scriptTemplates' | 'keyBindings'>
  >;
  updatedAt: string;
}
```

4. **Utökad `MatchConfigSnapshot`:**
```typescript
export interface MatchConfigSnapshot {
  version: number;
  teams: {
    home: Team;
    away: Team;
  };
  soundPads: SoundPad[];
  settings: AppSettings;
  savedRosters?: SavedRoster[];
  matchProfiles?: MatchProfile[];
  activeProfileId?: string | null;
}
```

### 4.2 Standarddata (`src/data/defaults.ts`)
*   `DEFAULT_KEY_BINDINGS: KeyBindings`:
    *   `actions`:
        *   `fadeOut`: `'Space'`
        *   `hardStop`: `'Shift+Space'`
        *   `toggleDuck`: `'D'`
        *   `goalHome`: `'F1'`
        *   `goalAway`: `'F2'`
        *   `penaltyHome`: `'F3'`
        *   `penaltyAway`: `'F4'`
    *   `pads`: `{}` (eller förvalda kortkommandon som inte krockar med `actions` — hålls rent eller mappat säkert utan dubbletter).
*   `DEFAULT_SETTINGS`:
    *   `spotifyClientId`: `'35b681ec04634ec3a6a5083ce87216c4'`
    *   `keyBindings`: `DEFAULT_KEY_BINDINGS`
*   `DEFAULT_SAVED_ROSTERS: SavedRoster[]`: Minst 4 förkonfigurerade laguppställningar (inkl. ledande nollor `"00"`):
    *   *Sundsvall Hockey U12* (`#2563eb`, `U12`)
    *   *Timrå IK U12* (`#ea580c`, `U12`)
    *   *Modo Hockey U12* (`#dc2626`, `U12`)
    *   *Östersunds IK U12* (`#16a34a`, `U12`)
*   `DEFAULT_MATCH_PROFILES: MatchProfile[]`: Minst 2 förkonfigurerade matchprofiler med distinkta låtuppsättningar och inställningar:
    *   *U12 Ungdomshockey – Standard* (`U12`)
    *   *Junior / A-lag – Arena Hype* (`Junior / A-lag`)

### 4.3 L2 Ren Domänlogik (`src/utils/domain.ts`)
Följande rena funktioner (utan DOM/React/`window`-beroenden) MÅSTE exporteras från `src/utils/domain.ts`:
1. **`normalizeHotkeyString(input: string): string`:**
   * Normaliserar strängar såsom `'space'`, `' '`, `'KeyD'`, `'d'`, `'shift+space'`, `'ctrl+f1'` till kanonisk form:
     * Modifierarordning: `Ctrl+Alt+Shift+Meta+<Key>` (t.ex. `'Shift+Space'`, `'Ctrl+Alt+Q'`).
     * Space: `' '` / `'Space'` / `'Spacebar'` -> `'Space'`.
     * Enstaka bokstäver / `KeyA..KeyZ` -> versal (`'D'`, `'Q'`).
     * Siffror / `Digit0..Digit9` -> `'0'..'9'`.
     * Funktionstangenter `f1..f12` -> `'F1'..'F12'`.
     * Tom/ogiltig eller ensam modifierare (`'Shift'`, `'Control'`, `'Alt'`, `'Meta'`) -> `''`.
2. **`formatHotkeyFromEvent(event: { key: string; code?: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }): string`:**
   * Om `event.key` är en ensam modifierare (`Shift`, `Control`, `Alt`, `Meta`), returnera `''`.
   * Bygger normaliserad kombination från `ctrlKey`, `altKey`, `shiftKey`, `metaKey` + `code`/`key` (t.ex. `code: 'KeyD'` eller `key: 'd'` -> `'D'`, `code: 'Space'` + `shiftKey: true` -> `'Shift+Space'`, `code: 'Digit1'` + `shiftKey: true` -> `'Shift+1'` så att Shift+siffra blir entydig oavsett tangentbordslayout).
3. **`assignHotkey(bindings: KeyBindings, target: { type: 'action'; id: MatchActionId } | { type: 'pad'; id: string }, hotkey: string): { keyBindings: KeyBindings; replacedTarget: string | null }`:**
   * Normaliserar `hotkey`.
   * Om tom sträng (`''`): tar bort bindningen för `target` (`actions[id] = ''` eller `delete pads[id]`) och returnerar `replacedTarget: null`.
   * Om icke-tom sträng: letar igenom alla `actions` och `pads`; om någon *annan* mål-ID redan har samma normaliserade `hotkey` rensas den gamla bindningen och dess beskrivande mål-ID returneras i `replacedTarget` (t.ex. `'action:goalHome'` eller `'pad:pad-hype-1'`).
4. **`resolveHotkeyMatch(bindings: KeyBindings, hotkey: string): { type: 'action'; id: MatchActionId } | { type: 'pad'; id: string } | null`:**
   * Normaliserar `hotkey` och returnerar matchande `action` eller `pad` (prioritet om dubblett skulle förekomma: `action` först, därefter `pad`), eller `null` om obunden.
5. **`sanitizeSavedRoster`, `sanitizeMatchProfile`, `sanitizeKeyBindings` & uppdaterad `sanitizeMatchConfig`:**
   * Idempotent sanering av hela `MatchConfigSnapshot`. Om `spotifyClientId` är tomt sätts `'35b681ec04634ec3a6a5083ce87216c4'`. Om äldre sparad data saknar `keyBindings`, `savedRosters` eller `matchProfiles`, fylls standardvärden i utan att krascha eller tappa användarens befintliga `teams` och `soundPads`.
   * Synkar `pad.hotkey` med `settings.keyBindings.pads[pad.id]`.

### 4.4 Utökad Zustand-store (`src/store/useAppStore.ts`)
*   State utökas med `savedRosters: SavedRoster[]`, `matchProfiles: MatchProfile[]`, `activeProfileId: string | null` (persisteras i `hockey_dj_state_v1` och inkluderas i `exportConfigJson` / `importConfigJson`).
*   Nya actions:
    *   `setActionHotkey(actionId: MatchActionId, hotkey: string): string | null`
    *   `setPadHotkey(padId: string, hotkey: string): string | null`
    *   `resetHotkeysToDefault(): void`
    *   `saveTeamToRosterLibrary(teamId: 'home' | 'away', customName?: string, ageGroupOrClub?: string, existingRosterId?: string): string`
    *   `loadRosterFromLibrary(rosterId: string, targetTeamId: 'home' | 'away'): boolean`
    *   `upsertSavedRoster(roster: Omit<SavedRoster, 'id' | 'updatedAt'> & { id?: string }): string`
    *   `deleteSavedRoster(rosterId: string): void`
    *   `duplicateSavedRoster(rosterId: string): string | null`
    *   `saveCurrentAsMatchProfile(name: string, clubOrAgeGroup?: string, includeTeams?: boolean, existingProfileId?: string): string`
    *   `activateMatchProfile(profileId: string, options?: { loadTeams?: boolean }): boolean`
    *   `deleteMatchProfile(profileId: string): void`
    *   `duplicateMatchProfile(profileId: string): string | null`

### 4.5 Gränssnitt & Kortkommandon (`src/components/` & `src/hooks/useKeyboardShortcuts.ts`)
1. **`TopBar.tsx` & `MatchView.tsx`:**
   *   Tydlig dropdown/snabbväljare för **Matchprofil** (visar aktiv profil + låter användaren snabbväxla profil med ett klick) samt snabbval för **Hemmalag** och **Bortalag** från `savedRosters`.
   *   Globala knappar i `TopBar.tsx`, händelseknappar i `MatchView.tsx` (`MÅL HEMMALAG`, `MÅL BORTALAG`, `UTVISNING HEMMALAG`, `UTVISNING BORTALAG`) och varje Soundboard-knapp visar sin aktuella bundna snabbtangent i en synlig badge (t.ex. `[F1]`, `[Space]`, `[Q]`).
2. **`SetupView.tsx`:**
   *   **Matchprofiler (Åldersgrupper / Klubbar):** Lista över sparade profiler med metadata, knappar `[Aktivera Låtar]`, `[Aktivera inkl. Lag]`, `[Spara över med nuvarande]`, `[Duplicera]`, `[Ta bort]` samt formulär för att spara ny matchprofil.
   *   **Roster-bibliotek (Många sparade laguppställningar):**
       *   På både Hemmalag- och Bortalagssektionen: snabbväljare för att ladda från eller spara till Roster-biblioteket.
       *   Dedikerad översikt över alla `savedRosters` med namn, klubb/ålder, lagfärg, antal spelare, samt snabba action-knappar: `[Sätt som Hemmalag]`, `[Sätt som Bortalag]`, `[Uppdatera från Hemma]`, `[Uppdatera från Borta]`, `[Duplicera]`, `[Ta bort]`, samt formulär för att skapa/spara ny trupp.
   *   **Snabbkommandon i Inställningar (och på Soundpads):**
       *   Lista över alla 7 `MatchActionId` + samtliga `SoundPad`-knappar.
       *   Interaktiv knapp `"Byt tangent..."` -> lyssnarläge (`"Tryck på en tangent (Esc avbryter)..."`), fångar tangent via `formatHotkeyFromEvent`, binder direkt, hanterar och meddelar eventuell konflikt/ersättning.
       *   `[Rensa]`-knapp per funktion/pad samt `[Återställ standardkortkommandon]`.
       *   Inne på varje SoundPad-kort i Soundboard-konfigurationen finns även snabbkoppling för att binda/visa knappens hotkey direkt.
3. **`useKeyboardShortcuts.ts` & `App.tsx`:**
   *   Läser `settings.keyBindings` dynamiskt.
   *   Stänger automatiskt av global trigger-hantering när en hotkey-inspelare (`data-hotkey-recording="true"`) eller textfält (`INPUT`, `TEXTAREA`, `SELECT`, `contentEditable`) är aktivt.
   *   När ingen modal är öppen triggas bundna `MatchActionId` (`fadeOut`, `hardStop`, `toggleDuck`, `goalHome`, `goalAway`, `penaltyHome`, `penaltyAway`) och bundna `SoundPad`-knappar (spelar låt / startar ev. `triggerFlow`).
   *   När Mål- eller Utvisningsmodal är öppen behålls `0–9`, `Backspace`, `Enter`, `Escape` för numpaden, medan de konfigurerade tangenterna för `fadeOut`, `hardStop` och `toggleDuck` fungerar globalt.

---

## 5. Oracle Contract (The Gate of Truth)
Verifieras av `Agent-Oracle` i Modul `05_oracle_profiles_hotkeys` via `tests/test_unit_domain.py`, `tests/oracle_hockeyjockey.py` och `/home/ma-auto/DEV/bin/invoke-v2-gate` med `exit code 0` och `"overall_status": "VERIFIED"`.

---

## 6. Resursallokering & Sub-Agent Roster

| Roster-Profil | Tilldelad Modell & Tier (`models.json`) | Ansvarsområde |
| :--- | :--- | :--- |
| **`Agent-Logic`** | **Claude Sonnet 5.5 (Medium)** | Nivå 3 Custom Code för Modul 04 (`src/`). |

**Tilldelad Roster-Profil för denna modul:** `Agent-Logic`  
**Tilldelad Modell:** `Claude Sonnet 5.5 (Medium)`
