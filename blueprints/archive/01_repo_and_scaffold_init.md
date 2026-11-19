# Blueprint: 01_repo_and_scaffold (Init V2)
Status: READY_TO_EXECUTE

> [!IMPORTANT]
> **READ-ONLY KONTRAKT FÖR SUB-AGENTER:**  
> Denna fil utgör "Sacred Truth" för modulen. Sub-agenter instrueras att läsa denna fil exakt en gång vid uppstart och betrakta den som orubblig lag. Sub-agenter får **ALDRIG skriva till eller modifiera denna fil**. Om ett databasschema eller ett API-gränssnitt behöver ändras, MÅSTE agenten stanna, eskalera till Master Coordinator och invänta en uppdaterad blueprint.

---

## 1. Syfte & Strategiskt Mål
Etablera den versionshanterade projektgrunden för **HockeyJockey** (Hockey DJ & Speaker Assistant) i `/home/ma-auto/DEV/HockeyJockey`, koppla den till ett nytt publikt GitHub-repository (`5w00t3dL10n/HockeyJockey`), kopiera projektets `.antigravityrules` samt sätta upp en kompilerbar Vite + React + TypeScript + Tailwind CSS + Zustand + Lucide-scaffold redo för modul 02 (`02_hockey_dj_app`).

---

## 2. Rollfördelning & Ansvarsområden (Who Does What)
*   **Dirigenten (Människan/Kaptenen):**
    *   Äger de strategiska besluten och godkänner driftsättning och fysisk provning med Spotify-konto i webbläsare.
*   **Lead Architect (Master-agenten i ai-master-config):**
    *   Ansvarar för teknisk design, UEF-V2-ritningar, Tech Stack Audit och delegering. Rör ingen delprojekt-källkod direkt.
*   **Specialiserad Sub-Agent (`Agent-IO` — `Gemini 3.8 Flash (Low)`):**
    *   Exekverar i Sandbox Mode (Auto-Approve), initierar lokalt Git-arkiv och GitHub-repo via CLI (`git`, `gh`), installerar npm-beroenden och grundkonfiguration samt verifierar Stage 0–1 via `/home/ma-auto/DEV/bin/invoke-v2-gate`.

---

## 3. Tech Stack & Tool-First Audit (MANDATORY)

| Område | Frågeställning | Audit-resultat |
| :--- | :--- | :--- |
| **Nivå 1 (OS-Native)** | Kan uppgiften lösas med inbyggda terminalkommandon (Bash/filoperationer)? | **Delvis Ja** – Katalogstruktur, kopiering av `.antigravityrules` och filhantering sköts via OS-nativa verktyg. |
| **Motivering (varför Nivå 1 förkastas)** | *Ej tillämpligt (Nivå 3 används ej i denna modul).* | Endast Nivå 1 (OS-Native) och Nivå 2 (etablerade CLI-verktyg) används för initiering och scaffolding. |
| **Nivå 2 (Etablerade CLI-verktyg)** | Finns etablerade CLI-verktyg i stacken? | **Ja** – `git`, `gh`, `node`, `npm`, `python3`, `/home/ma-auto/DEV/bin/sync-blueprints`, `/home/ma-auto/DEV/bin/invoke-v2-gate`. |
| **Maskinberoende (Capabilities)** | Kräver uppgiften verktyg som kanske saknas på vissa noder? | `git,node,npm,python,gh` (Kontrolleras i Stage 0 via `probe-environment.py`). |
| **Gate Runner Integration** | Vilka deterministiska kommandon ska bindas till Stage 0 och Stage 1? | Stage 0: `probe-environment.py --check "git,node,npm,gh"`; Stage 1: `npx tsc --noEmit` (via `invoke-v2-gate`). |

---

## 4. Sacred Truth (Design & Arkitektur)

### 4.1 Lagertillhörighet & Calm Technology
*   **Primärt Lager:** `[L0 Transport / Infrastruktur & Verktygsgrund]`
*   **Skyddsregel för befintliga filer:** Filen `/home/ma-auto/DEV/HockeyJockey/teknisk_specifikation_hockey_dj_speaker_assistant.md` MÅSTE bevaras helt oförändrad och checkas in i Git.
*   **Calm Tech Guard:** Vid `npm create` eller scaffolding får inga befintliga dokument i `/home/ma-auto/DEV/HockeyJockey/` skrivas över. Om `gh repo create` rapporterar att fjärrrepot redan finns på GitHub ska agenten stanna och eskalera till Master Coordinator.

### 4.2 Repository & Filstruktur (Kontrakt)
*   **Lokal sökväg:** `/home/ma-auto/DEV/HockeyJockey`
*   **Git branch:** `main`
*   **GitHub remote (`origin`):** `https://github.com/5w00t3dL10n/HockeyJockey.git` (publikt repository skapat via `gh repo create HockeyJockey --public --source=/home/ma-auto/DEV/HockeyJockey --remote=origin`).
*   **Obligatoriska grundfiler:**
    *   `.antigravityrules` (kopierad från `/home/ma-auto/DEV/blueprints/v2/TEMPLATE_subproject_antigravityrules.md`)
    *   `.gitignore` (inkluderar `node_modules/`, `dist/`, `.env`, `.env.local`, `*.local`, `scratch/` — exkluderar INTE `.gate_telemetry.json` eftersom telemetribeviset ska versionshanteras)
    *   `package.json` med:
        *   `dependencies`: `react`, `react-dom`, `lucide-react`, `zustand`
        *   `devDependencies`: `typescript`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@types/node`, `tailwindcss`, `@tailwindcss/vite`, `vitest`, `tsx`
        *   `scripts`: `"dev": "vite --host 127.0.0.1 --port 5173"`, `"build": "tsc -b && vite build"`, `"preview": "vite preview"`, `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`
    *   `tsconfig.json` (strikt TypeScript med `strict: true`, `jsx: "react-jsx"`, `moduleResolution: "bundler"`, `noEmit: true` eller standard Vite TS-konfiguration där `npx tsc --noEmit` passerar med 0 fel)
    *   `vite.config.ts` (Vite med `@vitejs/plugin-react` och `@tailwindcss/vite`, server konfigurerad på `host: '127.0.0.1'`, `port: 5173` för att matcha Spotify Redirect URI `http://127.0.0.1:5173/callback`)
    *   `index.html` (Dark mode-titel `"Hockey DJ & Speaker Assistant"`, `lang="sv"`)
    *   `src/index.css` (Tailwind v4 `@import "tailwindcss";` eller motsvarande fungerande Tailwind CSS-import)
    *   `src/main.tsx` och minimal kompilerande `src/App.tsx`

---

## 5. Oracle Contract (The Gate of Truth)
*   **Verifieringskriterier för Modul 01:**
    1. `python3 /home/ma-auto/DEV/bin/probe-environment.py --check "git,node,npm,python,gh"` returnerar exit code `0`.
    2. `npx tsc --noEmit` och `npm run build` i `/home/ma-auto/DEV/HockeyJockey` returnerar exit code `0`.
    3. `git remote -v` visar `origin` mot `5w00t3dL10n/HockeyJockey` och `gh repo view 5w00t3dL10n/HockeyJockey` bekräftar att GitHub-repot existerar.
    4. `/home/ma-auto/DEV/bin/sync-blueprints --project HockeyJockey` har synkroniserat ritningarna till `/home/ma-auto/DEV/HockeyJockey/blueprints/`.

---

## 6. Resursallokering & Sub-Agent Roster (Triage-Resultat)

| Roster-Profil | Tilldelad Modell & Tier (`models.json`) | Ansvarsområde i Denna Modul |
| :--- | :--- | :--- |
| **`Agent-IO`** | **Gemini 3.8 Flash (Low)** | Nivå 1 OS-Native, Git-initiering, `gh repo create`, npm-scaffolding, kopiering av `.antigravityrules` och `sync-blueprints`. *(Fallback: Gemini 4 Neon (Low))* |

**Tilldelad Roster-Profil för denna modul:** `Agent-IO`  
**Tilldelad Modell:** `Gemini 3.8 Flash (Low)`
