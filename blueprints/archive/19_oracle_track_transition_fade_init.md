# Blueprint: 19_oracle_track_transition_fade (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**.

---

## 1. Syfte & Strategiskt Mål
Utöka Stage 2-enhetstesterna (`tests/test_unit_domain.py`) och Stage 4-funktionsoraklet (`tests/oracle_hockeyjockey.py`) för att verifiera konfigurationssanering (`crossfadeEnabled`, `crossfadeDurationMs`) samt tvåfasig Fade Out / Fade In i `AudioController.playAt()` vid låtbyte under pågående uppspelning.

---

## 2. Rollfördelning
*   **`Agent-Oracle` (`Gemini 4 Neon (High)`):** Strikt isolerad från `src/`; uppdaterar endast `tests/` och kör `/home/ma-auto/DEV/bin/invoke-v2-gate`.
*   **`Agent-IO` (`Gemini 3.8 Flash (Low)`):** Arkiverar `18_*` och `19_*`, committar och pushar till GitHub (`5w00t3dL10n/HockeyJockey`), samt bekräftar att dev-servern på `http://127.0.0.1:5173` är aktiv med HTTP `200`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan orakeltester lösas enbart med Bash? | **Nej** (testlogik), **Ja** (arkivering & git push via `Agent-IO`). |
| **Motivering (varför Nivå 1 förkastas)** | *Obligatoriskt för Stage 2 & Stage 4:* | Kräver exekvering av `AudioController` med tidsramper och volymhistorik för både Spotify och lokal ljudfil i Node/`npx tsx` samt produktionsbygge. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg? | **Ja** – `/home/ma-auto/DEV/bin/invoke-v2-gate`, `python3`, `npx`, `npm`, `git`, `gh`. |
| **Gate Runner Integration** | Exakt kommando | `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"` |

---

## 4. Oracle Contract (Stage 2 & Stage 4 Krav)
1. **Stage 2 (`tests/test_unit_domain.py`):** Utöver befintliga 22 tester:
   * Verifiera att `sanitizeMatchConfig` / `sanitizeMatchProfile` ger defaultvärden (`crossfadeEnabled: true`, `crossfadeDurationMs: 350`) när fält saknas i äldre data, klampning (`[0, 5000]`) samt bevarande av explicit `false` och anpassade tider.
2. **Stage 4 (`tests/oracle_hockeyjockey.py`):** Utöver befintliga 21 kontroller:
   * Verifiera `AudioController.playAt()` vid övergångar:
     1. Start från tystnad (`isPlaying === false`) startar Låt 1 direkt på målvolym (`1.0`).
     2. När Låt 2 startas medan Låt 1 spelas (`fadeOutMs: 150, fadeInMs: 150`): Låt 1:s volym tonas stegvis ned till `0.0` *innan* Låt 2 startas med initial volym `0.0`, varefter Låt 2 tonas upp stegvis till sin målvolym (testas för både Spotify -> Spotify, Lokal -> Lokal och Spotify -> Lokal).
     3. Med `fadeWhenPlaying: false` (eller `fadeOutMs: 0, fadeInMs: 0`) sker byte direkt på målvolym utan rampsteg.
