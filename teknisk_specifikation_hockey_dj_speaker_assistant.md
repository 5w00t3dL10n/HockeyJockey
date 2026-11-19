# Teknisk Specifikation: Hockey DJ & Speaker Assistant

## 1. Projektöversikt

En webbaserad applikation för matchsekretariat inom ishockey (initialt anpassad för ungdomshockey/U12, 5 mot 5). Applikationen kombinerar en **realtidsstyrd Spotify-soundboard** med ett **interaktivt talstöd (teleprompter)** för speakern.

### Huvudmål

* **Noll fördröjning / hög precision:** Spela upp specifika Spotify-låtar från exakt förinställd tidpunkt (`ms`) med ett enda klick.

* **Smidig ljudkontroll:** Automatisk volymsänkning (*audio ducking*) när speakern ska prata, mjuk uttoning (*fade-out*) vid nedsläpp samt panikstopp (*hard stop*).

* **Minskad kognitiv belastning:** Sekventiella, tydliga arbetsflöden vid matchhändelser (t.ex. Utvisning eller Mål) som slår upp spelarnamn mot laguppställningen och genererar färdigt talmanus i stor text.

## 2. Rekommenderad Teknisk Stack

För enkel drift lokalt (t.ex. på Ubuntu/Linux) och minimal konfiguration rekommenderas en ren klientbaserad SPA (Single Page Application):

* **Ramverk:** React + TypeScript (via Vite)

* **Styling:** Tailwind CSS (Dark Mode som standard för mörka ishallar/sekretariat)

* **Ljud / Spotify:** Spotify Web Playback SDK + Spotify Web API (autentisering via **OAuth 2.0 PKCE-flöde**, vilket eliminerar behovet av en separat backend-server för hemliga nycklar)

* **Tillståndshantering:** React Context / Zustand

* **Lagring:** `localStorage` för automatisk sparning mellan omladdningar + **JSON Export/Import** för att kunna spara och ladda matchkonfigurationer och laguppställningar.

* **Ikoner:** Lucide React (UI) + egna/anpassade SVG-ikoner för domartecken.

## 3. Spotify-integration & Ljudmotor (Realtidskrav)

> **Förutsättning:** Användaren har ett aktivt Spotify Premium-konto och ett registrerat Client ID i Spotify Developer Dashboard (Redirect URI t.ex. `http://127.0.0.1:5173/callback`).

### 3.1 Virtuell spelare (Web Playback SDK)

* Applikationen registrerar webbläsaren som en egen Spotify Connect-enhet (t.ex. `"Hockey DJ Booth"`).

* Genom att spela upp direkt i webbläsaren minimeras nätverkslatens jämfört med att fjärrstyra en extern Spotify-klient.

* Automatisk hantering av token-förnyelse (*refresh token*) så att sessionen inte bryts under matchen.

### 3.2 Uppspelning med exakt starttid

* Vid tryck på en knapp anropas Spotify Web API `PUT /v1/me/player/play?device_id={id}` med payload:

  ```
  {
    "uris": ["spotify:track:{trackId}"],
    "position_ms": 45000
  }
  
  ```

* Innan uppspelning återställs volymen till knappens konfigurerade målvolym (default `1.0` / 100 %).

### 3.3 Ljudkontroll (Ducking, Fade-out & Stopp)

Eftersom Spotify SDK saknar inbyggd fade-funktion ska en dedikerad ljudkontroller (`AudioController`) implementeras:

* **Audio Ducking (`duckVolume`):** Sänker mjukt volymen från nuvarande nivå till konfigurerad pratnivå (t.ex. `0.20`) över ca `400 ms` (intervall på `50 ms`).

* **Restore Volume (`restoreVolume`):** Höjer mjukt volymen tillbaka till `1.0` (användbart efter att speakern pratat klart vid t.ex. mål).

* **Mjuk uttoning (`fadeOutAndPause`):** Sänker volymen stegvis ned till `0.0` över `600 ms` och anropar därefter `player.pause()`.

* **Panikstopp (`hardStop`):** Omedelbar `player.pause()` utan fördröjning.

## 4. Funktionella Krav & Användarflöden

Applikationen består av två huvudlägen: **Matchläge** (används live) och **Förberedelseläge** (setup innan match).

### 4.1 Matchläge (Huvudvy)

Skärmen är uppdelad i:

1. **Topplist:** Status för Spotify-anslutning, nuvarande låt & volymreglage, samt permanenta globala knappar:

   * `[FADE OUT / SLÄPP PUCK]` (Stor, tydlig knapp – även kopplad till `Space`).

   * `[TVÄRSTOPP]` (Röd knapp).

   * `[DUCKA / PRATA]` (Toggle för manuell sänkning till 20 % volym).

2. **Händelseknappar (Triggers med Talstöd):**

   * `MÅL HEMMALAG`

   * `MÅL BORTALAG`

   * `UTVISNING HEMMALAG (Boxplay)`

   * `UTVISNING BORTALAG (Powerplay)`

3. **Snabbknappar / Soundboard (Ren musikstyrning):**

   * Rutnät med konfigurerbara knappar grupperade per kategori:

     * *Tekning Anfallszon*

     * *Tekning Försvarszon*

     * *Pepp / Underläge*

     * *Orgel / Publikpepp (t.ex. Charge)*

     * *Timeout / Paus / Skada*

   * **Rotation/Pool-stöd:** En knapp (t.ex. "Tekning Anfall") ska kunna innehålla antingen en enskild låt eller en lista med flera låtar (med individuella starttider) som roteras automatiskt vid varje tryck för att undvika upprepning.

### 4.2 Flöde A: Utvisning (Hemma eller Borta)

När användaren klickar på `UTVISNING BORTALAG` (eller `HEMMALAG`) startas en modal/helskärmsvy över huvudvyn:

1. **Steg 0 (Omedelbart vid klick):** Vald utvisningslåt startar på sin förinställda tidpunkt (`position_ms`) på 100 % volym.

2. **Steg 1 – Spelarnummer (Numpad):**

   * En stor, touch-vänlig numpad (`0–9`, `Sudda`, `Nästa`) visas.

   * Direkt medan siffrorna matas in visas live-uppslag mot valt lags spelartrupp (t.ex. `#22 – Rasmus Karlsson`). Om numret saknas i truppen tillåts man ändå gå vidare (visar då endast numret).

   * Möjlighet att välja `"Lagstraff"` (skippar spelarnummer, t.ex. för många spelare på isen).

3. **Steg 2 – Domartecken & Utvisningstid:**

   * Ett visuellt rutnät med tydliga knappar som innehåller **SVG-symbol för domartecken + namn**.

   * Standardlista på förseelser: *Tripping, Slashing, Hooking, Holding, Roughing (Ruffing), Interference, High-sticking, Boarding, Cross-checking, Charging, Checking from behind, Too many men (För många spelare), Delay of game*.

   * Snabbval för tid (förvalt: `2 minuter`, övriga knappar: `2+2 minuter`, `5 minuter`, `10 minuter`).

   * Klick på domartecken tar användaren direkt till Steg 3.

4. **Steg 3 – Talmanus (Teleprompter):**

   * Musiken **duckas automatiskt** till 20 % volym.

   * Skärmen visar färdigt manus med mycket stor, lättläst typografi:

     > *"Utvisning **\[Lagnamn\]** genom nummer **\[Nr\] \[Spelarnamn\]**, **\[Tid\]** för **\[Förseelse\]**."*
     > *(Exempel: "Sundsvall Hockey drar på sig en utvisning genom nummer 22, Rasmus Karlsson, 2 minuter för ruffing.")*

   * Action-knappar längst ner:

     * `[HÖJ MUSIKEN]` (återställer till 100 % utan att stänga).

     * `[KLAR / FADE OUT]` (tonar ut musiken och återgår till huvudvyn).

     * `[KLAR / BEHÅLL MUSIK]` (återgår till huvudvyn medan musiken fortsätter/höjs).

### 4.3 Flöde B: Mål (Hemma eller Borta)

1. **Steg 0 (Omedelbart vid klick):**

   * Vid `MÅL HEMMALAG`: Spelar mållåten direkt på förinställd tidpunkt.

   * Vid `MÅL BORTALAG`: Ingen musik startas automatiskt (sportsligt), men knapp finns i vyn för att starta en "Omstart/Pepp"-låt inför tekning.

2. **Steg 1 – Målskytt & Assist (Numpad):**

   * Inmatning av målskyttens nummer med direkt rosteruppslag.

   * Valfritt steg för Assist 1 och Assist 2, med tydlig genväg `[INGEN ASSIST / GÅ TILL MANUS]` för att hålla tempot högt.

3. **Steg 2 – Talmanus:**

   * Musiken duckas automatiskt till 20 % (alternativt manuell knapp `[DUCKA & PRATA]` så att mål-firandet hinner pågå i 10 sekunder först).

   * Visar tydligt manus:

     > *"Mål för **\[Lagnamn\]**! Målskytt nummer **\[Nr\] \[Namn\]**."*
     > *(Om assist finns: "Framspelad av nummer **\[Nr\] \[Namn\]** \[och nummer **\[Nr\] \[Namn\]**\].")*

   * Action-knappar: `[HÖJ MUSIKEN]`, `[KLAR / FADE OUT]`.

### 4.4 Förberedelseläge (Setup / Admin)

* **Laguppställningar (Roster Manager):**

  * Ange namn på Hemmalag och Bortalag.

  * Lägg till/redigera spelare (`nummer`, `namn`).

  * **Snabbimport:** Textfält där man kan klistra in en lista (t.ex. `22 Rasmus Karlsson` per rad) som parsas automatiskt.

* **Soundboard-konfiguration:**

  * Skapa, redigera, ta bort och ändra ordning på knappar.

  * Klistra in en vanlig Spotify-länk (`https://open.spotify.com/track/...`) som automatiskt konverteras till `spotify:track:...`.

  * Ange starttid i formatet `MM:SS` (konverteras internt till `ms`) samt färg och kategori.

  * Test-knapp (`[PROVSPELA 5 SEK]`) för att enkelt verifiera att starttiden sitter exakt rätt innan match.

* **Backup:** Knappar för `Exportera konfiguration (.json)` och `Importera konfiguration (.json)`.

## 5. Datamodeller (TypeScript)

```
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
  scriptTemplates: {
    penalty: string; // "{team} drar på sig en utvisning genom nummer {number}, {name}, {duration} för {reason}."
    penaltyTeam: string; // "Lagstraff för {team}, {duration} för {reason}."
    goal: string; // "Mål för {team}! Målskytt nummer {scorerNumber}, {scorerName}."
    goalWithAssist: string; // "Mål för {team}! Målskytt nummer {scorerNumber}, {scorerName}. Assist {assists}."
  };
}

```

## 6. UI/UX & Kortkommandon

* **Färgkodning:** Tydlig visuell skillnad mellan Hemmalag (t.ex. blå/grön) och Bortalag (t.ex. orange/röd) så speakern aldrig väljer fel lag under stress.

* **Touch & Mus:** Minsta klickyta på matchknappar bör vara `80x80px`.

* **Tangentbordsgenvägar (Globala & Modala):**

  * `Space`: Mjuk Fade-Out & Pausa musik (när inget textfält är fokuserat).

  * `Shift + Space`: Tvärstopp.

  * `D`: Toggle Audio Ducking (20 % / 100 %).

  * `0–9`, `Backspace`, `Enter`: Styr numpaden direkt när Mål- eller Utvisningsflödet är aktivt.

  * `Escape`: Avbryt/stäng aktivt talstödsflöde utan att stänga av musiken.

## 7. Föreslagen Implementationsplan (Faser)

1. **Fas 1 – Grund & Spotify-motor:**

   * Sätt upp Vite + React + TypeScript + Tailwind.

   * Implementera Spotify OAuth PKCE-inloggning och Web Playback SDK-anslutning.

   * Bygg `AudioController` med `playAt(uri, ms)`, `duck()`, `restore()`, `fadeOutAndPause()` och `hardStop()`.

2. **Fas 2 – Soundboard & Setup:**

   * Bygg Matchlägets knapp-grid och Setup-vy för att lägga till låtar (URL-parsning + `MM:SS` starttid) och laguppställningar (inkl. snabbimport via text).

   * Implementera `localStorage`-synk samt JSON import/export.

3. **Fas 3 – Interaktivt Talstöd (State Machine):**

   * Implementera modal-flödet för Utvisning (Numpad -> Rosteruppslag -> SVG-domartecken -> Talmanus + Auto-ducking).

   * Implementera modal-flödet för Mål (Målskytt -> Valfri Assist -> Talmanus).

4. **Fas 4 – Finputsning & Kortkommandon:**

   * Lägg till tangentbordsgenvägar (`Space`, `0–9`, `Esc`), rotationsstöd för tekningslåtar och test-uppspelning i Setup-vyn.