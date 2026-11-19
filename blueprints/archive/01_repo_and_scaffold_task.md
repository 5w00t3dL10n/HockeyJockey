# Task: 01_repo_and_scaffold (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-IO
Tilldelad Modell & Tier: Gemini 3.8 Flash (Low)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail (Mental Självverifiering)

> [!CAUTION]
> **TILLSTÅNDSLÅSNING FÖR SUB-AGENTEN:**  
> Innan du utför någon handling eller anropar något verktyg i denna turn, MÅSTE du bekräfta följande i din första tankeprocess:
> 1. *"Jag agerar i rollen som Agent-IO med tilldelad modell Gemini 3.8 Flash (Low)."*
> 2. *"Jag har läst och förstår Sacred Truth i `01_repo_and_scaffold_init.md`. Jag har READ-ONLY tillgång till `_init.md` och får ALDRIG ändra den."*
> 3. *"Jag respekterar Tool-First-hierarkin: Nivå 1 (OS-Native via Agent-IO) -> Nivå 2 (CLI-verktyg). Jag rör inte affärslogiken för modul 02."*
> 4. *"Filmodifikation (No-Code-in-Chat): Jag utför alla filändringar autonomt via filverktyg eller terminalkommandon och matar aldrig ut kodblock för manuell copy-paste."*
> 5. *"Sandbox-First Autonomi: Jag exekverar i Sandbox Mode med auto-godkännande utan att fråga om lov för standardkommandon."*
> 6. *"Om `probe-environment.py` rapporterar saknade verktyg (exit code 2), parkerar jag uppgiften omedelbart."*
> 7. *"Om `gh repo create` misslyckas p.g.a. att repot redan finns eller saknar behörighet, stoppar jag direkt och rapporterar felet."*

---

## 2. Exekveringssteg & Granulära Faser

### Fas 1: Förberedelser & Maskinkapacitet
- [ ] **Läs Sacred Truth:** Läs `01_repo_and_scaffold_init.md` en gång.
- [ ] **Validera Nodens Kapacitet (Stage 0):** Kör `python3 /home/ma-auto/DEV/bin/probe-environment.py --check "git,node,npm,python,gh"`.
- [ ] **Verifiera Specifikation:** Kontrollera att `/home/ma-auto/DEV/HockeyJockey/teknisk_specifikation_hockey_dj_speaker_assistant.md` finns och inte skrivs över.

### Fas 2: Git, GitHub & Vite/React/TS-Scaffold
- [ ] **Initiera Git-arkiv:** I `/home/ma-auto/DEV/HockeyJockey`, kör `git init -b main`.
- [ ] **Kopiera Regler & `.gitignore`:**
  - Kopiera `/home/ma-auto/DEV/blueprints/v2/TEMPLATE_subproject_antigravityrules.md` till `/home/ma-auto/DEV/HockeyJockey/.antigravityrules`.
  - Skapa `.gitignore` (ignorerar `node_modules/`, `dist/`, `.env`, `.env.local`, `*.local`, `scratch/` — behåller `.gate_telemetry.json`).
- [ ] **Etablera `package.json` och Projektkonfiguration:**
  - Initiera/skapa `package.json` med `react`, `react-dom`, `lucide-react`, `zustand` samt devDependencies `typescript`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@types/node`, `tailwindcss`, `@tailwindcss/vite`, `vitest`, `tsx`.
  - Kör `npm install` i `/home/ma-auto/DEV/HockeyJockey`.
  - Skapa `tsconfig.json`, `vite.config.ts` (port `5173`, host `127.0.0.1`), `index.html`, `src/index.css`, `src/main.tsx` och en minimal kompilerande `src/App.tsx`.
- [ ] **Synkronisera Blueprints:**
  - Kör `/home/ma-auto/DEV/bin/sync-blueprints --project HockeyJockey` så att ritningarna synkas till `/home/ma-auto/DEV/HockeyJockey/blueprints/`.
- [ ] **Skapa Initial Commit & GitHub Repository:**
  - Stage:a och committa grundfilerna (`teknisk_specifikation_hockey_dj_speaker_assistant.md`, `.antigravityrules`, `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/`, `blueprints/`).
  - Skapa GitHub-repot `5w00t3dL10n/HockeyJockey` via `gh repo create HockeyJockey --public --source=/home/ma-auto/DEV/HockeyJockey --remote=origin --push`.

### Fas 3: Statisk Verifiering (Stage 0 & Stage 1)
- [ ] **Kör Typecheck & Build:** Verifiera att `npx tsc --noEmit` och `npm run build` passerar med exit code `0`.
- [ ] **Kör Stage 0 & 1 via Gate Runner:** Kör `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --stage 0` och `--stage 1`.
- [ ] **Verifiera GitHub-koppling:** Bekräfta med `git remote -v` och `gh repo view 5w00t3dL10n/HockeyJockey`.

---

## 3. Acceptanskriterier & Exit-kriterier för Överlämning
1. Lokalt git-arkiv i `/home/ma-auto/DEV/HockeyJockey` på branch `main` med clean working tree (eller enbart synkad scaffold pushad).
2. Publikt GitHub-repository skapat och pushad till `https://github.com/5w00t3dL10n/HockeyJockey`.
3. `npx tsc --noEmit` och `npm run build` passerar med exit code `0`.
4. `blueprints/` synkad via `sync-blueprints` till `/home/ma-auto/DEV/HockeyJockey/blueprints/`.
5. Rapportera verifierad remote-URL, commit-hash och resultat av `tsc`/`build` till Master Coordinator.
