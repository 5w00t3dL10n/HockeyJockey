# Blueprint: 07_oracle_away_goal_and_metadata (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter instrueras att läsa denna fil exakt en gång vid uppstart och betrakta den som orubblig lag. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**.

---

## 1. Syfte & Strategiskt Mål
Utöka oberoende Stage 2-enhetstester och Stage 4-funktionsorakel för att verifiera inställningen **Sportslig tystnad vid bortamål (`awayGoalSilence`)** samt **automatisk Spotify-låtmetadata-parsning och import**, exekvera `invoke-v2-gate`, arkivera ritningar, pusha till GitHub och verifiera att Vite-servern (inkl. `/api/spotify-meta`) är live på `http://127.0.0.1:5173`.

---

## 2. Rollfördelning & Ansvarsområden
*   **`Agent-Oracle` (`Gemini 4 Neon (High)`):**
    *   Strikt isolerad från `src/` och `vite.config.ts`.
    *   Utökar `tests/test_unit_domain.py` och `tests/oracle_hockeyjockey.py`.
    *   Kör `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"`.
*   **`Agent-IO` (`Gemini 3.8 Flash (Low)`):**
    *   Arkiverar ritningarna `06_*` och `07_*`, committar och pushar till `https://github.com/5w00t3dL10n/HockeyJockey`, samt startar om dev-servern på `http://127.0.0.1:5173` så att den nya Vite-middlewaren `/api/spotify-meta` blir aktiv och verifierar HTTP `200` på både appen och `/api/spotify-meta`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan testsviter och funktionsorakel lösas enbart med Bash? | **Nej** (testlogik), **Ja** (arkivering, git-push & serveromstart via `Agent-IO`). |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt för Stage 2 & Stage 4:* | Kräver körning av TypeScript-domänlogik (`extractSpotifyTrackId`, `parseSpotifyMetadataPayload`, `sanitizeMatchConfig`) och `useAppStore` via `npx tsx` samt verifiering av produktionsbygge (`dist/`). |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `/home/ma-auto/DEV/bin/invoke-v2-gate`, `python3`, `node`, `npx`, `npm`, `git`, `gh`. |
| **Maskinberoende (Capabilities)** | Krävs specifika verktyg? | `git,node,npm,python,gh` |
| **Gate Runner Integration** | Exakt kommando | `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"` |

---

## 4. Sacred Truth (Orakelkontrakt)

### 4.1 Stage 2 Enhetstester (`tests/test_unit_domain.py`)
Utöver befintliga 9 tester MÅSTE Stage 2-sviten exekvera funktionerna i `src/utils/domain.ts` och verifiera:
1. **`extractSpotifyTrackId`:**
   * Extraherar exakt `'4QcBuV31ukMvsvviytKjWx'` från `https://open.spotify.com/track/4QcBuV31ukMvsvviytKjWx?si=ccd5352978464589`, `/intl-sv/track/...` och `spotify:track:4QcBuV31ukMvsvviytKjWx`.
   * Returnerar `null` för ogiltiga länkar.
2. **`parseSpotifyMetadataPayload`:**
   * Web API `/v1/tracks/{id}`-svar med multipla artister.
   * Spotify Embed `__NEXT_DATA__`-JSON och Embed HTML-sträng (både `__NEXT_DATA__`-script och `<title>`-fallback).
   * Spotify `/oembed`-svar (`"Titel - Artist"` och `author_name`).
   * Returnerar `null` vid ogiltig payload.
3. **`awayGoalSilence` i `sanitizeMatchConfig`:**
   * Defaultvärde `true` när fältet saknas i äldre konfiguration.
   * Bevarar explicit `false` och `true` vid sanering samt i `MatchProfile.settings`.

### 4.2 Stage 4 Objektivt Funktionsorakel (`tests/oracle_hockeyjockey.py`)
Utöver befintliga 9 kontroller MÅSTE Stage 4-oraklet verifiera:
1. **Produktionsbygge (`npm run build`):** Nybyggda `dist/`-artefakter på disk.
2. **`awayGoalSilence` i `useAppStore` & `MatchProfile`:**
   * Default `settings.awayGoalSilence === true`.
   * Uppdatering via `updateSettings({ awayGoalSilence: false })` -> `saveCurrentAsMatchProfile` -> byte till annan profil med `awayGoalSilence: true` -> byte tillbaka via `activateMatchProfile` återställer `awayGoalSilence === false`.
   * JSON export/import bevarar `awayGoalSilence`.
3. **`fetchSpotifyTrackMetadata` & Live-kompatibilitet:**
   * Verifierar att `fetchSpotifyTrackMetadata` hanterar ogiltig länk graciöst (`null` utan undantag) samt att `extractSpotifyTrackId` + `parseSpotifyMetadataPayload` fungerar med användarens exempellänk `https://open.spotify.com/track/4QcBuV31ukMvsvviytKjWx?si=ccd5352978464589`.

---

## 5. Resursallokering & Sub-Agent Roster

| Roster-Profil | Tilldelad Modell & Tier (`models.json`) | Ansvarsområde |
| :--- | :--- | :--- |
| **`Agent-Oracle`** | **Gemini 4 Neon (High)** | Utökar `tests/test_unit_domain.py` & `tests/oracle_hockeyjockey.py` samt kör `invoke-v2-gate`. |
| **`Agent-IO`** | **Gemini 3.8 Flash (Low)** | Arkivering, commit & GitHub-push samt omstart och HTTP-verifiering av dev-server inkl. `/api/spotify-meta`. |

**Tilldelad Roster-Profil för denna modul:** `Agent-Oracle` *(följt av `Agent-IO`)*  
**Tilldelad Modell:** `Gemini 4 Neon (High)` *(och `Gemini 3.8 Flash (Low)`)*
