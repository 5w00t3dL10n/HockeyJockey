#!/usr/bin/env python3
"""Stage 4 Objective Functional Oracle for HockeyJockey.

Verifies all requirements in section 4.3 of 03_oracle_and_gate_init.md AND section 4.2 of 05_oracle_profiles_hotkeys_init.md:
1. Production build (`npm run build`) and non-empty artifacts in `dist/`.
2. RFC 7636 Appendix B PKCE SHA-256 test vector via `generatePkceChallenge`.
3. All 13 penalty definitions in `src/data/penalties.ts` and SVG rendering in `src/components/RefereeIcons.tsx`.
4. JSON export/import round-trip (`exportMatchConfig` -> `importMatchConfig`) and headless `AudioController` execution.
5. Git repository state, active `main` branch, and `origin` remote pointing to `5w00t3dL10n/HockeyJockey`.
6. Zustand `useAppStore` SavedRoster library (>= 4 defaults, save with `"00"`, load to home/away, duplicate, delete).
7. Zustand `useAppStore` MatchProfile deterministic switching (`saveCurrentAsMatchProfile` -> `activateMatchProfile`).
8. Zustand `useAppStore` customizable hotkeys (`setActionHotkey`, `setPadHotkey` conflict transfer & pad.hotkey sync, `resetHotkeysToDefault`).
9. Zustand `useAppStore` full JSON export/import round-trip (`exportConfigJson` -> `importConfigJson`).

Deterministic exit codes:
- 0: All oracle checks passed.
- 1: One or more oracle checks failed.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def resolve_tsx_command() -> list[str]:
    """Return command prefix to execute TypeScript via local tsx or npx."""
    local_tsx = PROJECT_ROOT / "node_modules" / ".bin" / "tsx"
    if local_tsx.is_file() and os.access(local_tsx, os.X_OK):
        return [str(local_tsx)]
    return ["npx", "--no-install", "tsx"]


def run_ts_script(ts_source: str, timeout: int = 30) -> Any:
    """Execute TypeScript ES module source via tsx and parse final JSON line."""
    cmd = [*resolve_tsx_command(), "--input-type=module", "-"]
    proc = subprocess.run(
        cmd,
        input=ts_source,
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"tsx exited with code {proc.returncode}\n"
            f"STDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
        )
    lines = [line for line in proc.stdout.strip().splitlines() if line.strip()]
    if not lines:
        raise RuntimeError("tsx produced no output")
    return json.loads(lines[-1])


def check_production_build() -> None:
    """Oracle 1: Run `npm run build` and verify real artifacts in `dist/`."""
    dist_dir = PROJECT_ROOT / "dist"
    if dist_dir.exists():
        shutil.rmtree(dist_dir)

    proc = subprocess.run(
        ["npm", "run", "build"],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if proc.returncode != 0:
        raise AssertionError(
            f"`npm run build` failed (exit={proc.returncode}):\n"
            f"STDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
        )

    index_html = dist_dir / "index.html"
    assets_dir = dist_dir / "assets"

    if not index_html.is_file() or index_html.stat().st_size <= 0:
        raise AssertionError("`dist/index.html` missing or empty after `npm run build`")
    if not assets_dir.is_dir():
        raise AssertionError("`dist/assets/` directory missing after `npm run build`")

    js_files = [p for p in assets_dir.iterdir() if p.is_file() and p.suffix == ".js"]
    css_files = [p for p in assets_dir.iterdir() if p.is_file() and p.suffix == ".css"]

    if not js_files:
        raise AssertionError("No compiled .js artifacts found in `dist/assets/`")
    if not css_files:
        raise AssertionError("No compiled .css artifacts found in `dist/assets/`")

    for artifact in [*js_files, *css_files]:
        if artifact.stat().st_size <= 0:
            raise AssertionError(f"Built artifact is empty (0 bytes): {artifact}")

    html_content = index_html.read_text(encoding="utf-8")
    if not any(js.name in html_content for js in js_files):
        raise AssertionError("`dist/index.html` does not reference built JS artifact")
    if not any(css.name in html_content for css in css_files):
        raise AssertionError("`dist/index.html` does not reference built CSS artifact")


def check_pkce_rfc7636() -> None:
    """Oracle 2: Verify RFC 7636 Appendix B SHA-256 PKCE test vector."""
    rfc_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    rfc_expected_challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

    script = f"""
import {{ generatePkceChallenge, generatePkceVerifier }} from './src/utils/domain.ts';

const rfcChallenge = await generatePkceChallenge({json.dumps(rfc_verifier)});
const generatedVerifier = generatePkceVerifier(64);
const generatedChallenge = await generatePkceChallenge(generatedVerifier);

console.log(JSON.stringify({{
  rfcChallenge,
  generatedVerifier,
  generatedChallenge,
}}));
"""
    res = run_ts_script(script)

    if res["rfcChallenge"] != rfc_expected_challenge:
        raise AssertionError(
            f"RFC 7636 PKCE challenge mismatch: expected {rfc_expected_challenge!r}, "
            f"got {res['rfcChallenge']!r}"
        )

    verifier = res["generatedVerifier"]
    if not re.fullmatch(r"[A-Za-z0-9\-._~]{64}", verifier):
        raise AssertionError(f"Generated PKCE verifier violates RFC 7636 format: {verifier!r}")

    expected_generated = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
        .decode("ascii")
        .rstrip("=")
    )
    if res["generatedChallenge"] != expected_generated:
        raise AssertionError(
            f"Generated verifier challenge mismatch: expected {expected_generated!r}, "
            f"got {res['generatedChallenge']!r}"
        )


def check_penalties_and_referee_icons() -> None:
    """Oracle 3: Verify 13 penalty definitions and corresponding SVG icons."""
    script = """
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PENALTY_DEFINITIONS } from './src/data/penalties.ts';
import { RefereeIcon } from './src/components/RefereeIcons.tsx';

const rendered = PENALTY_DEFINITIONS.map((penalty) => ({
  ...penalty,
  svg: renderToStaticMarkup(React.createElement(RefereeIcon, { iconKey: penalty.iconKey })),
}));

const fallbackSentinelSvg = renderToStaticMarkup(
  React.createElement(RefereeIcon, { iconKey: '__missing_oracle_sentinel__' }),
);

console.log(JSON.stringify({
  count: PENALTY_DEFINITIONS.length,
  rendered,
  fallbackSentinelSvg,
}));
"""
    res = run_ts_script(script)

    if res["count"] != 13:
        raise AssertionError(f"Expected exactly 13 penalty definitions, got {res['count']}")

    items = res["rendered"]
    ids: list[str] = []
    icon_keys: list[str] = []
    svgs: list[str] = []
    fallback_svg: str = res["fallbackSentinelSvg"]

    referee_icons_source = (PROJECT_ROOT / "src" / "components" / "RefereeIcons.tsx").read_text(
        encoding="utf-8"
    )

    for item in items:
        for field in ("id", "labelSv", "labelEn", "iconKey"):
            val = item.get(field)
            if not isinstance(val, str) or not val.strip():
                raise AssertionError(f"Penalty item missing non-empty {field}: {item!r}")

        pid = item["id"]
        icon_key = item["iconKey"]
        svg = item["svg"]

        ids.append(pid)
        icon_keys.append(icon_key)
        svgs.append(svg)

        if f"case '{icon_key}':" not in referee_icons_source:
            raise AssertionError(
                f"RefereeIcons.tsx is missing explicit switch case for iconKey {icon_key!r}"
            )

        if icon_key != "delay_of_game" and svg == fallback_svg:
            raise AssertionError(
                f"RefereeIcon rendered fallback SVG for iconKey {icon_key!r}"
            )

        try:
            root = ET.fromstring(svg)
        except ET.ParseError as exc:
            raise AssertionError(f"Invalid SVG XML for {icon_key!r}: {exc}") from exc

        tag_local = root.tag.rsplit("}", 1)[-1]
        if tag_local != "svg":
            raise AssertionError(f"Expected <svg> root for {icon_key!r}, got <{tag_local}>")
        if root.attrib.get("viewBox") != "0 0 48 48":
            raise AssertionError(
                f"Unexpected SVG viewBox for {icon_key!r}: {root.attrib.get('viewBox')!r}"
            )

        child_tags = {child.tag.rsplit("}", 1)[-1] for child in root}
        if not child_tags.intersection({"path", "circle", "rect", "line", "polygon"}):
            raise AssertionError(f"SVG for {icon_key!r} contains no drawing primitives: {svg}")

    if len(set(ids)) != 13:
        raise AssertionError(f"Duplicate penalty IDs detected: {ids}")
    if len(set(icon_keys)) != 13:
        raise AssertionError(f"Duplicate penalty iconKeys detected: {icon_keys}")
    if len(set(svgs)) != 13:
        raise AssertionError("Rendered SVGs for the 13 penalties are not all distinct")


def check_json_roundtrip_and_audio_controller() -> None:
    """Oracle 4: Verify exportMatchConfig -> importMatchConfig round-trip and AudioController."""
    script = """
import {
  DEFAULT_KEY_BINDINGS,
  DEFAULT_MATCH_PROFILES,
  DEFAULT_SAVED_ROSTERS,
  DEFAULT_SETTINGS,
  DEFAULT_SOUND_PADS,
} from './src/data/defaults.ts';
import { AudioController } from './src/services/audioController.ts';
import {
  exportMatchConfig,
  importMatchConfig,
  tryImportMatchConfig,
} from './src/utils/domain.ts';

const snapshot = {
  version: 1,
  teams: {
    home: {
      id: 'home',
      name: 'Örnsköldsvik SK',
      color: '#1d4ed8',
      roster: {
        '00': 'Oscar Holm (MV)',
        '07': 'Anna Berg',
        '22': 'Rasmus Karlsson',
      },
    },
    away: {
      id: 'away',
      name: 'Sundsvall Tigers',
      color: '#ea580c',
      roster: {
        '00': 'Liam Lundgren (MV)',
        '14': 'Erik Svensson',
      },
    },
  },
  soundPads: DEFAULT_SOUND_PADS.map((pad, idx) =>
    idx === 0
      ? {
          ...pad,
          volume: 0.85,
          tracks: [
            ...pad.tracks,
            {
              trackUri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
              title: 'Oracle Anthem',
              artist: 'Arena Band',
              startTimeMs: 45000,
            },
          ],
        }
      : {
          ...pad,
          tracks: pad.tracks.map((t) => ({ ...t })),
        },
  ),
  settings: {
    ...DEFAULT_SETTINGS,
    duckVolume: 0.25,
    fadeOutDurationMs: 450,
    spotifyClientId: 'oracle-client-id-123',
    keyBindings: {
      actions: { ...DEFAULT_KEY_BINDINGS.actions },
      pads: { ...DEFAULT_KEY_BINDINGS.pads },
    },
    scriptTemplates: {
      ...DEFAULT_SETTINGS.scriptTemplates,
      goal: 'MÅL! {team} #{scorerNumber} {scorerName}.',
    },
  },
  savedRosters: DEFAULT_SAVED_ROSTERS.map((r) => ({ ...r, roster: { ...r.roster } })),
  matchProfiles: DEFAULT_MATCH_PROFILES.map((p) => ({
    ...p,
    soundPads: p.soundPads.map((pad) => ({
      ...pad,
      tracks: pad.tracks.map((t) => ({ ...t })),
    })),
  })),
  activeProfileId: DEFAULT_MATCH_PROFILES[0]?.id ?? null,
};

const exportedJson = exportMatchConfig(snapshot);
const reimported = importMatchConfig(exportedJson);
const invalidTryImport = tryImportMatchConfig('{ invalid json');

// Verify AudioController in headless/fallback mode
const emittedModes = [];
const controller = new AudioController();
const unsub = controller.subscribe((snap) => {
  emittedModes.push(`${snap.mode}:${snap.isPlaying}:${snap.isDucked}:${snap.volume}`);
});

const initialState = controller.getState();

await controller.playAt(
  'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
  15000,
  1.0,
  undefined,
  { title: 'Oracle Horn', artist: 'Arena' },
);
const afterPlay = controller.getState();

await controller.duckVolume(0.2, 150);
const afterDuck = controller.getState();

await controller.restoreVolume(1.0, 150);
const afterRestore = controller.getState();

await controller.fadeOutAndPause(150);
const afterFadeOut = controller.getState();

await controller.playAt('spotify:track:4uLU6hMCjMI75M1A2tKUQC', 5000, 0.9);
await controller.hardStop();
const afterHardStop = controller.getState();

unsub();
controller.dispose();

// Also test fallback when Spotify adapter is marked ready but throws on playTrack
const fallbackController = new AudioController({
  isReady: () => true,
  getDeviceId: () => 'fake-device',
  playTrack: async () => {
    throw new Error('Simulated Spotify failure');
  },
  pause: async () => {},
  setVolume: async () => {},
});
await fallbackController.playAt('spotify:track:4uLU6hMCjMI75M1A2tKUQC', 0, 1.0);
const afterFallbackPlay = fallbackController.getState();
await fallbackController.hardStop();
fallbackController.dispose();

console.log(JSON.stringify({
  snapshot,
  reimported,
  invalidTryImport,
  initialState,
  afterPlay,
  afterDuck,
  afterRestore,
  afterFadeOut,
  afterHardStop,
  afterFallbackPlay,
  emittedCount: emittedModes.length,
}));
"""
    res = run_ts_script(script, timeout=30)

    snapshot = res["snapshot"]
    reimported = res["reimported"]

    if reimported != snapshot:
        raise AssertionError(
            "MatchConfigSnapshot round-trip mismatch:\n"
            f"EXPECTED: {json.dumps(snapshot, ensure_ascii=False)}\n"
            f"ACTUAL:   {json.dumps(reimported, ensure_ascii=False)}"
        )

    if reimported["teams"]["home"]["roster"].get("00") != "Oscar Holm (MV)":
        raise AssertionError("Home roster '00' lost during export/import round-trip")
    if reimported["teams"]["away"]["roster"].get("00") != "Liam Lundgren (MV)":
        raise AssertionError("Away roster '00' lost during export/import round-trip")
    if res["invalidTryImport"].get("ok") is not False:
        raise AssertionError("tryImportMatchConfig did not reject invalid JSON")

    init_s = res["initialState"]
    if init_s["mode"] != "simulated" or init_s["isPlaying"] is not False:
        raise AssertionError(f"Unexpected AudioController initial state: {init_s}")

    play_s = res["afterPlay"]
    if (
        play_s["mode"] != "simulated"
        or play_s["isPlaying"] is not True
        or play_s["isDucked"] is not False
        or play_s["volume"] != 1.0
        or play_s["positionMs"] < 15000
        or (play_s["currentTrack"] or {}).get("trackUri") != "spotify:track:4uLU6hMCjMI75M1A2tKUQC"
    ):
        raise AssertionError(f"Unexpected AudioController state after playAt: {play_s}")

    duck_s = res["afterDuck"]
    if duck_s["isDucked"] is not True or abs(duck_s["volume"] - 0.2) > 1e-6 or duck_s["isPlaying"] is not True:
        raise AssertionError(f"Unexpected AudioController state after duckVolume: {duck_s}")

    restore_s = res["afterRestore"]
    if restore_s["isDucked"] is not False or abs(restore_s["volume"] - 1.0) > 1e-6 or restore_s["isPlaying"] is not True:
        raise AssertionError(f"Unexpected AudioController state after restoreVolume: {restore_s}")

    fade_s = res["afterFadeOut"]
    if fade_s["isPlaying"] is not False or fade_s["isDucked"] is not False or abs(fade_s["volume"] - 0.0) > 1e-6:
        raise AssertionError(f"Unexpected AudioController state after fadeOutAndPause: {fade_s}")

    stop_s = res["afterHardStop"]
    if stop_s["isPlaying"] is not False or stop_s["isDucked"] is not False:
        raise AssertionError(f"Unexpected AudioController state after hardStop: {stop_s}")

    fb_s = res["afterFallbackPlay"]
    if (
        fb_s["mode"] != "simulated"
        or fb_s["isPlaying"] is not True
        or fb_s["error"] != "Simulated Spotify failure"
    ):
        raise AssertionError(f"Unexpected AudioController fallback state: {fb_s}")

    if res["emittedCount"] < 5:
        raise AssertionError(f"Expected >= 5 subscriber emissions, got {res['emittedCount']}")


def check_git_and_github_remote() -> None:
    """Oracle 5: Verify `.git`, active `main` branch, and `origin` -> `5w00t3dL10n/HockeyJockey`."""
    git_dir = PROJECT_ROOT / ".git"
    if not git_dir.exists():
        raise AssertionError(f"Missing .git in {PROJECT_ROOT}")

    def git_out(*args: str) -> str:
        proc = subprocess.run(
            ["git", *args],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            raise AssertionError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
        return proc.stdout.strip()

    if git_out("rev-parse", "--is-inside-work-tree") != "true":
        raise AssertionError("Project directory is not a git work tree")

    branch = git_out("rev-parse", "--abbrev-ref", "HEAD")
    if branch != "main":
        raise AssertionError(f"Expected active branch 'main', got {branch!r}")

    origin_url = git_out("remote", "get-url", "origin")
    if "5w00t3dL10n/HockeyJockey" not in origin_url:
        raise AssertionError(
            f"Remote 'origin' does not point to 5w00t3dL10n/HockeyJockey: {origin_url!r}"
        )


def check_store_saved_rosters() -> None:
    """Oracle 6: Verify useAppStore SavedRoster library (defaults, save with '00', load home/away, duplicate, delete)."""
    script = """
import { useAppStore } from './src/store/useAppStore.ts';

useAppStore.getState().resetToDefaults();
const initialRosters = useAppStore.getState().savedRosters.map((r) => ({ ...r, roster: { ...r.roster } }));

// Save Roster A from home team with jersey '00'
useAppStore.getState().updateTeamInfo('home', { name: 'Luleå HF J18', color: '#dc2626' });
useAppStore.getState().importRoster('home', '00 Hampus Keeper\\n19 Emil Forward', 'replace');
const rosterAId = useAppStore.getState().saveTeamToRosterLibrary('home', 'Luleå J18 Trupp', 'J18');

// Save Roster B directly via upsertSavedRoster with jersey '00'
const rosterBId = useAppStore.getState().upsertSavedRoster({
  name: 'Skellefteå AIK U16',
  teamName: 'Skellefteå AIK',
  color: '#f59e0b',
  ageGroupOrClub: 'U16',
  roster: {
    '00': 'Albin Målvakt',
    '88': 'Viktor Back',
  },
});

const loadHomeOk = useAppStore.getState().loadRosterFromLibrary(rosterBId, 'home');
const homeAfterLoad = {
  ...useAppStore.getState().teams.home,
  roster: { ...useAppStore.getState().teams.home.roster },
};

const loadAwayOk = useAppStore.getState().loadRosterFromLibrary(rosterAId, 'away');
const awayAfterLoad = {
  ...useAppStore.getState().teams.away,
  roster: { ...useAppStore.getState().teams.away.roster },
};

const loadMissingOk = useAppStore.getState().loadRosterFromLibrary('non-existent-roster', 'home');

const dupId = useAppStore.getState().duplicateSavedRoster(rosterAId);
const countAfterDup = useAppStore.getState().savedRosters.length;
const duplicatedEntry = useAppStore.getState().savedRosters.find((r) => r.id === dupId) ?? null;

if (dupId) {
  useAppStore.getState().deleteSavedRoster(dupId);
}
const afterDeleteIds = useAppStore.getState().savedRosters.map((r) => r.id);

console.log(JSON.stringify({
  initialCount: initialRosters.length,
  rosterAId,
  rosterBId,
  loadHomeOk,
  homeAfterLoad,
  loadAwayOk,
  awayAfterLoad,
  loadMissingOk,
  dupId,
  countAfterDup,
  duplicatedEntry,
  afterDeleteIds,
}));
"""
    res = run_ts_script(script)

    if res["initialCount"] < 4:
        raise AssertionError(f"Expected >= 4 default saved rosters, got {res['initialCount']}")

    if not res["loadHomeOk"]:
        raise AssertionError("loadRosterFromLibrary failed for home team")
    home = res["homeAfterLoad"]
    if (
        home["id"] != "home"
        or home["name"] != "Skellefteå AIK"
        or home["color"] != "#f59e0b"
        or home["roster"].get("00") != "Albin Målvakt"
        or home["roster"].get("88") != "Viktor Back"
    ):
        raise AssertionError(f"Unexpected home team state after loading SavedRoster: {home}")

    if not res["loadAwayOk"]:
        raise AssertionError("loadRosterFromLibrary failed for away team")
    away = res["awayAfterLoad"]
    if (
        away["id"] != "away"
        or away["name"] != "Luleå HF J18"
        or away["color"] != "#dc2626"
        or away["roster"].get("00") != "Hampus Keeper"
        or away["roster"].get("19") != "Emil Forward"
    ):
        raise AssertionError(f"Unexpected away team state after loading SavedRoster: {away}")

    if res["loadMissingOk"] is not False:
        raise AssertionError("loadRosterFromLibrary should return false for missing rosterId")

    dup_id = res["dupId"]
    if not isinstance(dup_id, str) or not dup_id or dup_id == res["rosterAId"]:
        raise AssertionError(f"duplicateSavedRoster returned invalid id: {dup_id!r}")

    if res["countAfterDup"] != res["initialCount"] + 3:
        raise AssertionError(
            f"Expected {res['initialCount'] + 3} saved rosters after 2 saves + 1 duplicate, got {res['countAfterDup']}"
        )

    dup = res["duplicatedEntry"]
    if not dup or dup["name"] != "Luleå J18 Trupp (kopia)" or dup["roster"].get("00") != "Hampus Keeper":
        raise AssertionError(f"Unexpected duplicated SavedRoster entry: {dup}")

    after_ids = res["afterDeleteIds"]
    if dup_id in after_ids:
        raise AssertionError(f"Deleted SavedRoster {dup_id!r} still present in savedRosters")
    if res["rosterAId"] not in after_ids or res["rosterBId"] not in after_ids:
        raise AssertionError("Deleting duplicate accidentally removed non-deleted SavedRosters")


def check_store_match_profiles() -> None:
    """Oracle 7: Verify useAppStore MatchProfile creation and deterministic back-and-forth switching."""
    script = """
import { useAppStore } from './src/store/useAppStore.ts';

useAppStore.getState().resetToDefaults();

// Configure and save Profile 1 (Youth / U10)
useAppStore.getState().updateSettings({ duckVolume: 0.35, fadeOutDurationMs: 800 });
useAppStore.getState().addSoundPad({
  id: 'pad-u10-custom',
  label: 'U10 Målklocka',
  category: 'goal_home',
  color: '#2563eb',
  tracks: [
    {
      trackUri: 'spotify:track:1111111111111111111111',
      title: 'U10 Song',
      artist: 'Kids Band',
      startTimeMs: 10000,
    },
  ],
  volume: 0.9,
  triggerFlow: 'goal_home',
});
useAppStore.getState().setPadHotkey('pad-u10-custom', 'Digit1');
const profile1Id = useAppStore.getState().saveCurrentAsMatchProfile('U10 Lördagsmatch', 'U10', false);
const activeAfterSave1 = useAppStore.getState().activeProfileId;

// Configure and save Profile 2 (Senior / A-lag) with different pads, tracks, and settings
useAppStore.getState().deleteSoundPad('pad-u10-custom');
useAppStore.getState().addSoundPad({
  id: 'pad-senior-custom',
  label: 'A-Lag Intro',
  category: 'hype',
  color: '#dc2626',
  tracks: [
    {
      trackUri: 'spotify:track:2222222222222222222222',
      title: 'Heavy Arena Rock',
      artist: 'Rock Band',
      startTimeMs: 45000,
    },
  ],
  volume: 1.0,
  triggerFlow: null,
});
useAppStore.getState().updateSettings({ duckVolume: 0.1, fadeOutDurationMs: 300 });
useAppStore.getState().setPadHotkey('pad-senior-custom', 'Digit2');
const profile2Id = useAppStore.getState().saveCurrentAsMatchProfile('A-Lag Fredag', 'Senior / A-lag', false);
const activeAfterSave2 = useAppStore.getState().activeProfileId;

function snapshotActive() {
  const st = useAppStore.getState();
  return {
    activeProfileId: st.activeProfileId,
    duckVolume: st.settings.duckVolume,
    fadeOutDurationMs: st.settings.fadeOutDurationMs,
    padHotkeys: { ...st.settings.keyBindings.pads },
    soundPads: st.soundPads.map((p) => ({
      id: p.id,
      label: p.label,
      hotkey: p.hotkey ?? null,
      tracks: p.tracks.map((t) => ({ ...t })),
    })),
  };
}

const activated1 = useAppStore.getState().activateMatchProfile(profile1Id);
const stateP1 = snapshotActive();

const activated2 = useAppStore.getState().activateMatchProfile(profile2Id);
const stateP2 = snapshotActive();

const activated1Again = useAppStore.getState().activateMatchProfile(profile1Id);
const stateP1Again = snapshotActive();

const activatedMissing = useAppStore.getState().activateMatchProfile('missing-profile-id');

console.log(JSON.stringify({
  profile1Id,
  profile2Id,
  activeAfterSave1,
  activeAfterSave2,
  activated1,
  activated2,
  activated1Again,
  activatedMissing,
  stateP1,
  stateP2,
  stateP1Again,
}));
"""
    res = run_ts_script(script)

    if res["activeAfterSave1"] != res["profile1Id"] or res["activeAfterSave2"] != res["profile2Id"]:
        raise AssertionError("activeProfileId was not updated upon saveCurrentAsMatchProfile")
    if not res["activated1"] or not res["activated2"] or not res["activated1Again"]:
        raise AssertionError("activateMatchProfile unexpectedly returned false for valid profile")
    if res["activatedMissing"] is not False:
        raise AssertionError("activateMatchProfile should return false for unknown profileId")

    p1 = res["stateP1"]
    p2 = res["stateP2"]
    p1_again = res["stateP1Again"]

    if p1 != p1_again:
        raise AssertionError("Switching Profile 1 -> Profile 2 -> Profile 1 was not deterministic")

    p1_pad_ids = {p["id"]: p for p in p1["soundPads"]}
    if "pad-u10-custom" not in p1_pad_ids or "pad-senior-custom" in p1_pad_ids:
        raise AssertionError(f"Profile 1 soundPads mismatch: {list(p1_pad_ids.keys())}")
    if (
        p1_pad_ids["pad-u10-custom"]["tracks"][0]["title"] != "U10 Song"
        or p1_pad_ids["pad-u10-custom"]["hotkey"] != "1"
        or p1["duckVolume"] != 0.35
        or p1["fadeOutDurationMs"] != 800
        or p1["activeProfileId"] != res["profile1Id"]
    ):
        raise AssertionError(f"Unexpected Profile 1 state after activation: {p1}")

    p2_pad_ids = {p["id"]: p for p in p2["soundPads"]}
    if "pad-senior-custom" not in p2_pad_ids or "pad-u10-custom" in p2_pad_ids:
        raise AssertionError(f"Profile 2 soundPads mismatch: {list(p2_pad_ids.keys())}")
    if (
        p2_pad_ids["pad-senior-custom"]["tracks"][0]["title"] != "Heavy Arena Rock"
        or p2_pad_ids["pad-senior-custom"]["hotkey"] != "2"
        or p2["duckVolume"] != 0.1
        or p2["fadeOutDurationMs"] != 300
        or p2["activeProfileId"] != res["profile2Id"]
    ):
        raise AssertionError(f"Unexpected Profile 2 state after activation: {p2}")


def check_store_hotkeys() -> None:
    """Oracle 8: Verify setActionHotkey, setPadHotkey (conflict transfer & pad.hotkey sync), and resetHotkeysToDefault."""
    script = """
import { DEFAULT_KEY_BINDINGS } from './src/data/defaults.ts';
import { useAppStore } from './src/store/useAppStore.ts';

useAppStore.getState().resetToDefaults();

const replaced1 = useAppStore.getState().setActionHotkey('toggleDuck', 'KeyM');
const toggleDuckAfterSet = useAppStore.getState().settings.keyBindings.actions.toggleDuck;

const replaced2 = useAppStore.getState().setPadHotkey('pad-hype-1', 'Digit7');
const padHypeAfterSet = useAppStore.getState().soundPads.find((p) => p.id === 'pad-hype-1')?.hotkey ?? null;

// Conflict: pad-organ-1 steals 'F1' from action 'goalHome'
const replaced3 = useAppStore.getState().setPadHotkey('pad-organ-1', 'f1');
const stateAfterConflict1 = {
  goalHomeAction: useAppStore.getState().settings.keyBindings.actions.goalHome,
  padOrganBinding: useAppStore.getState().settings.keyBindings.pads['pad-organ-1'] ?? null,
  padOrganSynced: useAppStore.getState().soundPads.find((p) => p.id === 'pad-organ-1')?.hotkey ?? null,
};

// Conflict: pad-hype-1 steals 'F1' from pad-organ-1
const replaced4 = useAppStore.getState().setPadHotkey('pad-hype-1', 'F1');
const stateAfterConflict2 = {
  padOrganBinding: useAppStore.getState().settings.keyBindings.pads['pad-organ-1'] ?? null,
  padOrganSynced: useAppStore.getState().soundPads.find((p) => p.id === 'pad-organ-1')?.hotkey ?? null,
  padHypeBinding: useAppStore.getState().settings.keyBindings.pads['pad-hype-1'] ?? null,
  padHypeSynced: useAppStore.getState().soundPads.find((p) => p.id === 'pad-hype-1')?.hotkey ?? null,
};

// Conflict: action 'goalHome' steals 'F1' back from pad-hype-1
const replaced5 = useAppStore.getState().setActionHotkey('goalHome', 'F1');
const stateAfterConflict3 = {
  goalHomeAction: useAppStore.getState().settings.keyBindings.actions.goalHome,
  padHypeBinding: useAppStore.getState().settings.keyBindings.pads['pad-hype-1'] ?? null,
  padHypeSynced: useAppStore.getState().soundPads.find((p) => p.id === 'pad-hype-1')?.hotkey ?? null,
};

useAppStore.getState().resetHotkeysToDefault();
const bindingsAfterReset = useAppStore.getState().settings.keyBindings;
const anyPadHasHotkeyAfterReset = useAppStore.getState().soundPads.some((p) => Boolean(p.hotkey));

console.log(JSON.stringify({
  defaultKeyBindings: DEFAULT_KEY_BINDINGS,
  replaced1,
  toggleDuckAfterSet,
  replaced2,
  padHypeAfterSet,
  replaced3,
  stateAfterConflict1,
  replaced4,
  stateAfterConflict2,
  replaced5,
  stateAfterConflict3,
  bindingsAfterReset,
  anyPadHasHotkeyAfterReset,
}));
"""
    res = run_ts_script(script)

    if res["replaced1"] is not None or res["toggleDuckAfterSet"] != "M":
        raise AssertionError(f"setActionHotkey failed: replaced={res['replaced1']!r}, val={res['toggleDuckAfterSet']!r}")
    if res["replaced2"] is not None or res["padHypeAfterSet"] != "7":
        raise AssertionError(f"setPadHotkey failed: replaced={res['replaced2']!r}, val={res['padHypeAfterSet']!r}")

    if res["replaced3"] != "action:goalHome":
        raise AssertionError(f"Expected conflict target 'action:goalHome', got {res['replaced3']!r}")
    c1 = res["stateAfterConflict1"]
    if c1["goalHomeAction"] != "" or c1["padOrganBinding"] != "F1" or c1["padOrganSynced"] != "F1":
        raise AssertionError(f"Unexpected state after action->pad conflict transfer: {c1}")

    if res["replaced4"] != "pad:pad-organ-1":
        raise AssertionError(f"Expected conflict target 'pad:pad-organ-1', got {res['replaced4']!r}")
    c2 = res["stateAfterConflict2"]
    if (
        c2["padOrganBinding"] is not None
        or c2["padOrganSynced"] is not None
        or c2["padHypeBinding"] != "F1"
        or c2["padHypeSynced"] != "F1"
    ):
        raise AssertionError(f"Unexpected state after pad->pad conflict transfer: {c2}")

    if res["replaced5"] != "pad:pad-hype-1":
        raise AssertionError(f"Expected conflict target 'pad:pad-hype-1', got {res['replaced5']!r}")
    c3 = res["stateAfterConflict3"]
    if c3["goalHomeAction"] != "F1" or c3["padHypeBinding"] is not None or c3["padHypeSynced"] is not None:
        raise AssertionError(f"Unexpected state after pad->action conflict transfer: {c3}")

    if res["bindingsAfterReset"] != res["defaultKeyBindings"]:
        raise AssertionError(f"resetHotkeysToDefault mismatch: {res['bindingsAfterReset']}")
    if res["anyPadHasHotkeyAfterReset"]:
        raise AssertionError("Some SoundPad still has a hotkey after resetHotkeysToDefault")


def check_store_export_import_roundtrip() -> None:
    """Oracle 9: Verify useAppStore exportConfigJson -> importConfigJson full round-trip."""
    script = """
import { useAppStore } from './src/store/useAppStore.ts';

useAppStore.getState().resetToDefaults();
useAppStore.getState().updateTeamInfo('home', { name: 'Kalix HC', color: '#0f172a' });
useAppStore.getState().upsertPlayer('home', '00', 'Test Målvakt');
const customRosterId = useAppStore.getState().saveTeamToRosterLibrary('home', 'Kalix A-Lag', 'HockeyEttan');

useAppStore.getState().setActionHotkey('toggleDuck', 'KeyK');
useAppStore.getState().setPadHotkey('pad-hype-1', 'Digit8');
const customProfileId = useAppStore.getState().saveCurrentAsMatchProfile('Kalix Matchprofil', 'HockeyEttan', true);

function captureRelevantState() {
  const st = useAppStore.getState();
  return {
    teams: st.teams,
    soundPads: st.soundPads,
    settings: st.settings,
    savedRosters: st.savedRosters,
    matchProfiles: st.matchProfiles,
    activeProfileId: st.activeProfileId,
  };
}

const beforeExport = captureRelevantState();
const exportedJson = useAppStore.getState().exportConfigJson();

useAppStore.getState().resetToDefaults();
const wipedState = captureRelevantState();

const importedReturn = useAppStore.getState().importConfigJson(exportedJson);
const afterImport = captureRelevantState();

console.log(JSON.stringify({
  customRosterId,
  customProfileId,
  beforeExport,
  wipedState,
  importedReturn: {
    teams: importedReturn.teams,
    soundPads: importedReturn.soundPads,
    settings: importedReturn.settings,
    savedRosters: importedReturn.savedRosters ?? [],
    matchProfiles: importedReturn.matchProfiles ?? [],
    activeProfileId: importedReturn.activeProfileId ?? null,
  },
  afterImport,
}));
"""
    res = run_ts_script(script)

    before = res["beforeExport"]
    wiped = res["wipedState"]
    imported_ret = res["importedReturn"]
    after = res["afterImport"]

    if wiped["activeProfileId"] == res["customProfileId"]:
        raise AssertionError("resetToDefaults did not clear custom activeProfileId before import check")

    for label, actual in (("store after importConfigJson", after), ("importConfigJson return value", imported_ret)):
        if actual["savedRosters"] != before["savedRosters"]:
            raise AssertionError(f"savedRosters mismatch in {label}")
        if actual["matchProfiles"] != before["matchProfiles"]:
            raise AssertionError(f"matchProfiles mismatch in {label}")
        if actual["activeProfileId"] != res["customProfileId"]:
            raise AssertionError(
                f"activeProfileId mismatch in {label}: expected {res['customProfileId']!r}, got {actual['activeProfileId']!r}"
            )
        if actual["settings"]["keyBindings"] != before["settings"]["keyBindings"]:
            raise AssertionError(f"settings.keyBindings mismatch in {label}")
        if actual["teams"] != before["teams"]:
            raise AssertionError(f"teams mismatch in {label}")
        if actual["soundPads"] != before["soundPads"]:
            raise AssertionError(f"soundPads mismatch in {label}")

    hype_pad = next((p for p in after["soundPads"] if p["id"] == "pad-hype-1"), None)
    if not hype_pad or hype_pad.get("hotkey") != "8":
        raise AssertionError(f"pad-hype-1 hotkey '8' was not preserved/synced on import: {hype_pad}")
    if after["teams"]["home"]["roster"].get("00") != "Test Målvakt":
        raise AssertionError("Jersey '00' lost during store exportConfigJson -> importConfigJson round-trip")


def main() -> int:
    checks = [
        ("1. Production build & dist/ artifacts", check_production_build),
        ("2. RFC 7636 PKCE SHA-256 vector", check_pkce_rfc7636),
        ("3. 13 Penalty definitions & RefereeIcons SVG", check_penalties_and_referee_icons),
        ("4. JSON export/import round-trip & AudioController", check_json_roundtrip_and_audio_controller),
        ("5. Git repository & origin remote", check_git_and_github_remote),
        ("6. Store SavedRoster library (defaults, '00', load, duplicate, delete)", check_store_saved_rosters),
        ("7. Store MatchProfile deterministic switching", check_store_match_profiles),
        ("8. Store hotkeys (setActionHotkey, setPadHotkey, conflicts, reset)", check_store_hotkeys),
        ("9. Store full JSON exportConfigJson -> importConfigJson round-trip", check_store_export_import_roundtrip),
    ]

    for label, fn in checks:
        print(f"[ORACLE] Running: {label}...", flush=True)
        try:
            fn()
        except Exception as exc:
            print(f"[ORACLE FAIL] {label}: {exc}", file=sys.stderr, flush=True)
            return 1
        print(f"[ORACLE PASS] {label}", flush=True)

    print(f"[ORACLE] All {len(checks)} objective functional oracle checks passed.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
