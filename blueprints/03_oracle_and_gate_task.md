# Task: 03_oracle_and_gate (Task V2)
Status: READY_TO_EXECUTE
Tilldelad Roster-Profil: Agent-Oracle
Tilldelad Modell & Tier: Gemini 4 Neon (High)
Exekveringsmiljö: [x] Sandbox Mode (Auto-Approve)

---

## 1. Obligatorisk Pre-Flight Guardrail (Mental Självverifiering)

> [!CAUTION]
> **TILLSTÅNDSLÅSNING FÖR SUB-AGENTEN:**  
> Innan du utför någon handling eller anropar något verktyg i denna turn, MÅSTE du bekräfta följande i din första tankeprocess:
> 1. *"Jag agerar i rollen som Agent-Oracle med tilldelad modell Gemini 4 Neon (High)."*
> 2. *"Jag har läst och förstår Sacred Truth i `03_oracle_and_gate_init.md`. Jag har READ-ONLY tillgång till `_init.md` och får ALDRIG ändra den."*
> 3. *"Strikt Isolering: Jag får ALDRIG modifiera källkodsfiler i `src/` eller slappna av på testkraven för att få ett grönt resultat."*
> 4. *"Filmodifikation (No-Code-in-Chat): Jag skriver test- och orakelfiler autonomt under `/home/ma-auto/DEV/HockeyJockey/tests/` utan kodblock i chatten."*
> 5. *"Sandbox-First Autonomi: Jag exekverar autonomt och kör `/home/ma-auto/DEV/bin/invoke-v2-gate`."*
> 6. *"Om Gate Runnern misslyckas rapporterar jag exakt felorsak och innehållet i `.gate_telemetry.json` tillbaka till Master Coordinator."*

---

## 2. Exekveringssteg & Granulära Faser

### Fas 1: Förberedelser & Läsning
- [ ] **Läs Sacred Truth:** Läs `03_oracle_and_gate_init.md` och granska exporterade symboler i `/home/ma-auto/DEV/HockeyJockey/src/` (strikt read-only mot `src/`).

### Fas 2: Konstruera Stage 2 & Stage 4 Tester (Isolerat under `tests/`)
- [ ] **Stage 2 Enhetstester:**
  - *Fil:* `/home/ma-auto/DEV/HockeyJockey/tests/test_unit_domain.py`
  - *Uppgift:* Skapa Python `unittest`-svit som via Node/`npx tsx` exekverar funktionerna i `src/utils/domain.ts` och verifierar alla 6 kravpunkter i sektion 4.2 av `03_oracle_and_gate_init.md`.
- [ ] **Stage 4 Objektivt Funktionsorakel:**
  - *Fil:* `/home/ma-auto/DEV/HockeyJockey/tests/oracle_hockeyjockey.py`
  - *Uppgift:* Skapa funktionsorakel som verifierar samtliga 5 kravpunkter i sektion 4.3 av `03_oracle_and_gate_init.md` (faktisk `npm run build` + `dist/`-artefakter, RFC 7636 PKCE-vektor, 13 domartecken + `RefereeIcons.tsx`, JSON-rundresa + `AudioController`-exekvering i headless/fallback, samt Git/GitHub-remote).

### Fas 3: Systemtvingad Verifiering (Gate Runner Automation)
- [ ] **Kör Gate Runner:** Exekvera från `/home/ma-auto/DEV/HockeyJockey`:
  `/home/ma-auto/DEV/bin/invoke-v2-gate --project "HockeyJockey" --required-tools "git,node,npm,python,gh" --oracle-script "tests/oracle_hockeyjockey.py"`
- [ ] **Kontrollera Telemetri:** Läs `/home/ma-auto/DEV/HockeyJockey/.gate_telemetry.json` och bekräfta `"overall_status": "VERIFIED"` och `"exit_code": 0` (eller rapportera exakt feldetalj om `exit_code != 0`).

---

## 3. Acceptanskriterier & Exit-kriterier för Överlämning
1. `tests/test_unit_domain.py` och `tests/oracle_hockeyjockey.py` existerar och inga filer i `src/` har ändrats av `Agent-Oracle`.
2. `/home/ma-auto/DEV/bin/invoke-v2-gate` har körts efter senaste redigering och returnerat `exit code 0`.
3. Hela JSON-innehållet i `.gate_telemetry.json` bifogas ordagrant i slutrapporten.
