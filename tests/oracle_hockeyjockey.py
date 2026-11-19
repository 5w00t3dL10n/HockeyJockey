#!/usr/bin/env python3
"""Stage 4 Objective Functional Oracle for HockeyJockey.

Verifies all requirements in section 4.3 of 03_oracle_and_gate_init.md, section 4.2 of 05_oracle_profiles_hotkeys_init.md, section 4.2 of 07_oracle_away_goal_and_metadata_init.md, section 4 of 09_oracle_spotify_resilience_init.md, section 4 of 11_oracle_custom_soundboard_groups_init.md, section 4.2 of 13_oracle_local_audio_files_init.md, AND section 4.2 of 15_oracle_embedded_media_archive_init.md:
1. Production build (`npm run build`) and non-empty artifacts in `dist/`.
2. RFC 7636 Appendix B PKCE SHA-256 test vector via `generatePkceChallenge`.
3. All 13 penalty definitions in `src/data/penalties.ts` and SVG rendering in `src/components/RefereeIcons.tsx`.
4. JSON export/import round-trip (`exportMatchConfig` -> `importMatchConfig`) and headless `AudioController` execution.
5. Git repository state, active `main` branch, and `origin` remote pointing to `5w00t3dL10n/HockeyJockey`.
6. Zustand `useAppStore` SavedRoster library (>= 4 defaults, save with `"00"`, load to home/away, duplicate, delete).
7. Zustand `useAppStore` MatchProfile deterministic switching (`saveCurrentAsMatchProfile` -> `activateMatchProfile`).
8. Zustand `useAppStore` customizable hotkeys (`setActionHotkey`, `setPadHotkey` conflict transfer & pad.hotkey sync, `resetHotkeysToDefault`).
9. Zustand `useAppStore` full JSON export/import round-trip (`exportConfigJson` -> `importConfigJson`).
10. Zustand `useAppStore` `awayGoalSilence` default (`true`), MatchProfile switching, and JSON export/import preservation.
11. Spotify track metadata (`fetchSpotifyTrackMetadata` graceful `null` on invalid URLs & `extractSpotifyTrackId` + `parseSpotifyMetadataPayload` with user example URL).
12. Self-healing `AudioController.playAt()` via `ensureReady()` and permanent failing adapter fallback to `'simulated'`.
13. `SpotifyPlayerService.discoverConnectDevice()` & `'connect'` transport (`playTrack` 404->transfer/discovery->204 retry, `pause`, throttled `setVolume`).
14. Zustand `useAppStore` custom `SoundboardGroup` CRUD (`addSoundboardGroup`, `updateSoundboardGroup`, `moveSoundboardGroup`, `deleteSoundboardGroup` with safe pad fallback migration).
15. Zustand `useAppStore` `MatchProfile` switching across profiles with distinct custom `soundboardGroups` and full JSON export/import round-trip (`exportConfigJson` -> `importConfigJson`).
16. `localAudioStorage` CRUD & playback URL caching (`saveLocalAudioFile`, `getLocalAudioRecord`, `getLocalAudioPlaybackUrl`, `listLocalAudioFiles`, `deleteLocalAudioFile`).
17. `AudioController.playAt()` with local audio file (`local:audio:...`), volume ramps (`duckVolume`, `restoreVolume`, `fadeOutAndPause`, `hardStop`), and Spotify `setVolume` isolation.
18. Zustand `useAppStore` full JSON export/import round-trip with local audio tracks (`sourceType: 'local'`, `localFileName`, `mimeType`).
19. Embedded media archive directory `src/media` existence, audio file filtering, `registerEmbeddedMediaItems`, `syncEmbeddedMediaArchive`, `getLocalAudioPlaybackUrl`, and `getLocalAudioRecord`.
20. Zustand `useAppStore.importEmbeddedMediaArchive` auto-creation in `'media_archive'` group, idempotency on repeated loads, user-deletion respect, and `resetToDefaults()` isolation.

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


def check_store_away_goal_silence() -> None:
    """Oracle 10: Verify awayGoalSilence default, MatchProfile switching, and JSON export/import round-trip."""
    script = """
import { useAppStore } from './src/store/useAppStore.ts';

useAppStore.getState().resetToDefaults();
const defaultAwayGoalSilence = useAppStore.getState().settings.awayGoalSilence;

// Set awayGoalSilence to false and save as MatchProfile
useAppStore.getState().updateSettings({ awayGoalSilence: false });
const afterUpdateFalse = useAppStore.getState().settings.awayGoalSilence;
const silentFalseProfileId = useAppStore.getState().saveCurrentAsMatchProfile(
  'Bortamål Tystnad AV',
  'U14',
  false,
);

// Create another MatchProfile with awayGoalSilence: true
useAppStore.getState().updateSettings({ awayGoalSilence: true });
const afterUpdateTrue = useAppStore.getState().settings.awayGoalSilence;
const silentTrueProfileId = useAppStore.getState().saveCurrentAsMatchProfile(
  'Bortamål Tystnad PÅ',
  'Senior',
  false,
);

// Switch to default/true profile then back to silentFalseProfileId
const activatedDefaultTrue = useAppStore.getState().activateMatchProfile('profile-u12-standard');
const valOnDefaultProfile = useAppStore.getState().settings.awayGoalSilence;

const activatedCustomTrue = useAppStore.getState().activateMatchProfile(silentTrueProfileId);
const valOnCustomTrueProfile = useAppStore.getState().settings.awayGoalSilence;

const activatedCustomFalse = useAppStore.getState().activateMatchProfile(silentFalseProfileId);
const valRestoredFalseProfile = useAppStore.getState().settings.awayGoalSilence;

// JSON export/import round-trip preserving awayGoalSilence: false and both MatchProfiles
const exportedFalseJson = useAppStore.getState().exportConfigJson();
useAppStore.getState().resetToDefaults();
const valAfterResetBeforeImport = useAppStore.getState().settings.awayGoalSilence;

const importedFalseResult = useAppStore.getState().importConfigJson(exportedFalseJson);
const valAfterImportFalse = useAppStore.getState().settings.awayGoalSilence;

const switchTrueAfterImport = useAppStore.getState().activateMatchProfile(silentTrueProfileId);
const valSwitchTrueAfterImport = useAppStore.getState().settings.awayGoalSilence;

const switchFalseAfterImport = useAppStore.getState().activateMatchProfile(silentFalseProfileId);
const valSwitchFalseAfterImport = useAppStore.getState().settings.awayGoalSilence;

// JSON export/import round-trip preserving awayGoalSilence: true
useAppStore.getState().activateMatchProfile(silentTrueProfileId);
const exportedTrueJson = useAppStore.getState().exportConfigJson();
useAppStore.getState().updateSettings({ awayGoalSilence: false });
const importedTrueResult = useAppStore.getState().importConfigJson(exportedTrueJson);
const valAfterImportTrue = useAppStore.getState().settings.awayGoalSilence;

console.log(JSON.stringify({
  defaultAwayGoalSilence,
  afterUpdateFalse,
  silentFalseProfileId,
  afterUpdateTrue,
  silentTrueProfileId,
  activatedDefaultTrue,
  valOnDefaultProfile,
  activatedCustomTrue,
  valOnCustomTrueProfile,
  activatedCustomFalse,
  valRestoredFalseProfile,
  valAfterResetBeforeImport,
  importedFalseSetting: importedFalseResult.settings.awayGoalSilence,
  valAfterImportFalse,
  switchTrueAfterImport,
  valSwitchTrueAfterImport,
  switchFalseAfterImport,
  valSwitchFalseAfterImport,
  importedTrueSetting: importedTrueResult.settings.awayGoalSilence,
  valAfterImportTrue,
}));
"""
    res = run_ts_script(script)

    if res["defaultAwayGoalSilence"] is not True:
        raise AssertionError(
            f"Expected default settings.awayGoalSilence === True, got {res['defaultAwayGoalSilence']!r}"
        )
    if res["afterUpdateFalse"] is not False:
        raise AssertionError(
            f"updateSettings({{ awayGoalSilence: false }}) failed: {res['afterUpdateFalse']!r}"
        )
    if res["afterUpdateTrue"] is not True:
        raise AssertionError(
            f"updateSettings({{ awayGoalSilence: true }}) failed: {res['afterUpdateTrue']!r}"
        )
    if not res["activatedDefaultTrue"] or res["valOnDefaultProfile"] is not True:
        raise AssertionError(
            f"Activating profile with awayGoalSilence: true failed: {res['valOnDefaultProfile']!r}"
        )
    if not res["activatedCustomTrue"] or res["valOnCustomTrueProfile"] is not True:
        raise AssertionError(
            f"Activating custom profile with awayGoalSilence: true failed: {res['valOnCustomTrueProfile']!r}"
        )
    if not res["activatedCustomFalse"] or res["valRestoredFalseProfile"] is not False:
        raise AssertionError(
            f"Switching back to profile with awayGoalSilence: false did not restore false: {res['valRestoredFalseProfile']!r}"
        )
    if res["valAfterResetBeforeImport"] is not True:
        raise AssertionError("resetToDefaults did not restore awayGoalSilence === True")
    if res["importedFalseSetting"] is not False or res["valAfterImportFalse"] is not False:
        raise AssertionError(
            f"JSON export/import did not preserve awayGoalSilence === false: "
            f"ret={res['importedFalseSetting']!r}, store={res['valAfterImportFalse']!r}"
        )
    if not res["switchTrueAfterImport"] or res["valSwitchTrueAfterImport"] is not True:
        raise AssertionError(
            f"Profile awayGoalSilence: true lost after JSON import: {res['valSwitchTrueAfterImport']!r}"
        )
    if not res["switchFalseAfterImport"] or res["valSwitchFalseAfterImport"] is not False:
        raise AssertionError(
            f"Profile awayGoalSilence: false lost after JSON import: {res['valSwitchFalseAfterImport']!r}"
        )
    if res["importedTrueSetting"] is not True or res["valAfterImportTrue"] is not True:
        raise AssertionError(
            f"JSON export/import did not preserve awayGoalSilence === true: "
            f"ret={res['importedTrueSetting']!r}, store={res['valAfterImportTrue']!r}"
        )


def check_spotify_track_metadata() -> None:
    """Oracle 11: Verify fetchSpotifyTrackMetadata graceful null on invalid links & compatibility with user example URL."""
    example_url = "https://open.spotify.com/track/4QcBuV31ukMvsvviytKjWx?si=ccd5352978464589"
    script = f"""
import {{ fetchSpotifyTrackMetadata }} from './src/services/spotifyMetadata.ts';
import {{
  extractSpotifyTrackId,
  parseSpotifyMetadataPayload,
  tryParseSpotifyUri,
}} from './src/utils/domain.ts';

const exampleUrl = {json.dumps(example_url)};
const expectedTrackId = '4QcBuV31ukMvsvviytKjWx';
const expectedTrackUri = 'spotify:track:4QcBuV31ukMvsvviytKjWx';

// 1. Invalid inputs to fetchSpotifyTrackMetadata must return null without throwing
const invalidResults = {{
  empty: await fetchSpotifyTrackMetadata(''),
  garbage: await fetchSpotifyTrackMetadata('not-a-spotify-link'),
  nonTrackUrl: await fetchSpotifyTrackMetadata('https://open.spotify.com/playlist/4QcBuV31ukMvsvviytKjWx'),
  wrongHost: await fetchSpotifyTrackMetadata('https://example.com/track/4QcBuV31ukMvsvviytKjWx'),
}};

// 2. Domain extraction & URI normalization on user's example link
const extractedId = extractSpotifyTrackId(exampleUrl);
const parsedUriResult = tryParseSpotifyUri(exampleUrl);

// 3. Payload parsing compatibility (Web API, Embed __NEXT_DATA__ HTML, oEmbed)
const parsedWebApi = parseSpotifyMetadataPayload({{
  id: extractedId,
  name: 'Example Arena Song',
  artists: [{{ name: 'Artist One' }}, {{ name: 'Artist Two' }}],
}});

const parsedEmbedHtml = parseSpotifyMetadataPayload(`
  <html>
    <head><title>Spotify</title></head>
    <body>
      <script id="__NEXT_DATA__" type="application/json">
        {{"props":{{"pageProps":{{"state":{{"data":{{"entity":{{"name":"Example Embed Track","artists":[{{"name":"Embed Band"}}]}}}}}}}}}}}}
      </script>
    </body>
  </html>
`);

const parsedOembed = parseSpotifyMetadataPayload({{
  title: 'Example OEmbed Track - OEmbed Artist',
  author_name: 'Spotify',
}});

// 4. Deterministic fetchSpotifyTrackMetadata paths using controlled globalThis.fetch
const originalFetch = globalThis.fetch;
let proxyResult = null;
let oembedFallbackResult = null;
let networkFailureResult = 'NOT_NULL';

try {{
  // 4a. Vite /api/spotify-meta path
  globalThis.fetch = async (url) => {{
    const urlStr = String(url);
    if (urlStr.includes('/api/spotify-meta?id=4QcBuV31ukMvsvviytKjWx')) {{
      return new Response(
        JSON.stringify({{
          trackId: expectedTrackId,
          trackUri: expectedTrackUri,
          title: 'Proxy Resolved Title',
          artist: 'Proxy Resolved Artist',
        }}),
        {{ status: 200, headers: {{ 'Content-Type': 'application/json' }} }},
      );
    }}
    return new Response('Not Found', {{ status: 404 }});
  }};
  proxyResult = await fetchSpotifyTrackMetadata(exampleUrl);

  // 4b. Fallback to /oembed when /api/spotify-meta returns 502
  globalThis.fetch = async (url) => {{
    const urlStr = String(url);
    if (urlStr.includes('/api/spotify-meta')) {{
      return new Response(JSON.stringify({{ error: 'upstream error' }}), {{ status: 502 }});
    }}
    if (urlStr.includes('https://open.spotify.com/oembed')) {{
      return new Response(
        JSON.stringify({{
          title: 'OEmbed Fallback Title - OEmbed Fallback Artist',
          author_name: 'Spotify',
        }}),
        {{ status: 200, headers: {{ 'Content-Type': 'application/json' }} }},
      );
    }}
    return new Response('Not Found', {{ status: 404 }});
  }};
  oembedFallbackResult = await fetchSpotifyTrackMetadata(exampleUrl);

  // 4c. Complete network outage -> must resolve gracefully to null without throwing
  globalThis.fetch = async () => {{
    throw new Error('Simulated offline network failure');
  }};
  networkFailureResult = await fetchSpotifyTrackMetadata(exampleUrl);
}} finally {{
  globalThis.fetch = originalFetch;
}}

console.log(JSON.stringify({{
  invalidResults,
  extractedId,
  parsedUriResult,
  parsedWebApi,
  parsedEmbedHtml,
  parsedOembed,
  proxyResult,
  oembedFallbackResult,
  networkFailureResult,
}}));
"""
    res = run_ts_script(script)

    for key, val in res["invalidResults"].items():
        if val is not None:
            raise AssertionError(
                f"fetchSpotifyTrackMetadata({key}) expected null, got {val!r}"
            )

    if res["extractedId"] != "4QcBuV31ukMvsvviytKjWx":
        raise AssertionError(
            f"extractSpotifyTrackId mismatch on example URL: {res['extractedId']!r}"
        )
    if res["parsedUriResult"] != {
        "ok": True,
        "uri": "spotify:track:4QcBuV31ukMvsvviytKjWx",
    }:
        raise AssertionError(
            f"tryParseSpotifyUri mismatch on example URL: {res['parsedUriResult']!r}"
        )

    if res["parsedWebApi"] != {
        "title": "Example Arena Song",
        "artist": "Artist One, Artist Two",
    }:
        raise AssertionError(f"Unexpected parsedWebApi result: {res['parsedWebApi']!r}")
    if res["parsedEmbedHtml"] != {
        "title": "Example Embed Track",
        "artist": "Embed Band",
    }:
        raise AssertionError(
            f"Unexpected parsedEmbedHtml result: {res['parsedEmbedHtml']!r}"
        )
    if res["parsedOembed"] != {
        "title": "Example OEmbed Track",
        "artist": "OEmbed Artist",
    }:
        raise AssertionError(f"Unexpected parsedOembed result: {res['parsedOembed']!r}")

    expected_proxy = {
        "trackUri": "spotify:track:4QcBuV31ukMvsvviytKjWx",
        "trackId": "4QcBuV31ukMvsvviytKjWx",
        "title": "Proxy Resolved Title",
        "artist": "Proxy Resolved Artist",
    }
    if res["proxyResult"] != expected_proxy:
        raise AssertionError(
            f"fetchSpotifyTrackMetadata proxy path mismatch: expected {expected_proxy!r}, got {res['proxyResult']!r}"
        )

    expected_oembed = {
        "trackUri": "spotify:track:4QcBuV31ukMvsvviytKjWx",
        "trackId": "4QcBuV31ukMvsvviytKjWx",
        "title": "OEmbed Fallback Title",
        "artist": "OEmbed Fallback Artist",
    }
    if res["oembedFallbackResult"] != expected_oembed:
        raise AssertionError(
            f"fetchSpotifyTrackMetadata oEmbed fallback mismatch: expected {expected_oembed!r}, got {res['oembedFallbackResult']!r}"
        )

    if res["networkFailureResult"] is not None:
        raise AssertionError(
            f"fetchSpotifyTrackMetadata did not return null on network failure: {res['networkFailureResult']!r}"
        )


def check_audio_controller_self_healing_ensure_ready() -> None:
    """Oracle 12: Verify self-healing AudioController.playAt() via ensureReady() and permanent failure fallback."""
    script = """
import { AudioController } from './src/services/audioController.ts';

// 1. Self-healing adapter: initially not ready, ensureReady() connects Spotify Desktop
let ready = false;
let currentDeviceId = null;
let currentDeviceName = null;
let ensureReadyCalls = 0;
const setVolumeCalls = [];
const playTrackCalls = [];
let pauseCalls = 0;

const selfHealingAdapter = {
  isReady: () => ready,
  getDeviceId: () => currentDeviceId,
  getDeviceName: () => currentDeviceName,
  ensureReady: async () => {
    ensureReadyCalls += 1;
    ready = true;
    currentDeviceId = 'connect-dev-1';
    currentDeviceName = 'Spotify Desktop';
    return true;
  },
  playTrack: async (trackUri, positionMs) => {
    playTrackCalls.push({ trackUri, positionMs });
  },
  pause: async () => {
    pauseCalls += 1;
  },
  setVolume: async (volume) => {
    setVolumeCalls.push(volume);
  },
};

const healingController = new AudioController(selfHealingAdapter);
await healingController.playAt(
  'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
  18000,
  0.85,
  undefined,
  { title: 'Resilience Horn', artist: 'Arena' },
);
const healedState = healingController.getState();
await healingController.hardStop();
healingController.dispose();

// 2. Permanent failure adapter without ensureReady (not ready) -> simulated fallback
let unreadyPlayTrackCalled = false;
const customFailingUnreadyAdapter = {
  isReady: () => false,
  getDeviceId: () => null,
  getDeviceName: () => null,
  playTrack: async () => {
    unreadyPlayTrackCalled = true;
  },
  pause: async () => {},
  setVolume: async () => {},
};
const unreadyFallbackController = new AudioController(customFailingUnreadyAdapter);
await unreadyFallbackController.playAt(
  'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
  5000,
  0.9,
);
const unreadyFallbackState = unreadyFallbackController.getState();
await unreadyFallbackController.hardStop();
unreadyFallbackController.dispose();

// 3. Permanent failure adapter without ensureReady (ready, but playTrack throws) -> simulated fallback
const customFailingAdapter = {
  isReady: () => true,
  getDeviceId: () => 'dead-device-1',
  playTrack: async () => {
    throw new Error('Permanent Spotify transport failure');
  },
  pause: async () => {},
  setVolume: async () => {},
};
const throwingFallbackController = new AudioController(customFailingAdapter);
await throwingFallbackController.playAt(
  'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
  0,
  1.0,
);
const throwingFallbackState = throwingFallbackController.getState();
await throwingFallbackController.hardStop();
throwingFallbackController.dispose();

console.log(JSON.stringify({
  ensureReadyCalls,
  setVolumeCalls,
  playTrackCalls,
  pauseCalls,
  healedState,
  unreadyPlayTrackCalled,
  unreadyFallbackState,
  throwingFallbackState,
}));
"""
    res = run_ts_script(script, timeout=30)

    if res["ensureReadyCalls"] != 1:
        raise AssertionError(
            f"Expected ensureReady() to be called exactly once, got {res['ensureReadyCalls']}"
        )
    if res["setVolumeCalls"] != [0.85]:
        raise AssertionError(
            f"Expected setVolume([0.85]) after ensureReady(), got {res['setVolumeCalls']!r}"
        )
    expected_play_calls = [
        {"trackUri": "spotify:track:4uLU6hMCjMI75M1A2tKUQC", "positionMs": 18000}
    ]
    if res["playTrackCalls"] != expected_play_calls:
        raise AssertionError(
            f"Expected playTrack calls {expected_play_calls!r}, got {res['playTrackCalls']!r}"
        )
    if res["pauseCalls"] < 1:
        raise AssertionError("Expected hardStop() to invoke pause() on healed adapter")

    healed = res["healedState"]
    if (
        healed["mode"] != "spotify"
        or healed["isPlaying"] is not True
        or healed["deviceId"] != "connect-dev-1"
        or healed["deviceName"] != "Spotify Desktop"
        or healed["statusMessage"] != "Spotify Ansluten (Spotify Desktop)"
        or healed["error"] is not None
        or healed["positionMs"] < 18000
    ):
        raise AssertionError(
            f"AudioController did not stay in 'spotify' mode after ensureReady(): {healed!r}"
        )

    if res["unreadyPlayTrackCalled"] is not False:
        raise AssertionError("playTrack should not be called when adapter lacks ensureReady and isReady() is false")
    unready_fb = res["unreadyFallbackState"]
    if unready_fb["mode"] != "simulated" or unready_fb["isPlaying"] is not True:
        raise AssertionError(
            f"Expected fallback to 'simulated' for unready adapter without ensureReady: {unready_fb!r}"
        )

    throwing_fb = res["throwingFallbackState"]
    if (
        throwing_fb["mode"] != "simulated"
        or throwing_fb["isPlaying"] is not True
        or throwing_fb["error"] != "Permanent Spotify transport failure"
        or throwing_fb["statusMessage"] != "Simulerat Läge (Spotify fallback)"
    ):
        raise AssertionError(
            f"Expected fallback to 'simulated' for customFailingAdapter: {throwing_fb!r}"
        )


def check_spotify_connect_discovery_and_transport() -> None:
    """Oracle 13: Verify SpotifyPlayerService.discoverConnectDevice() and 'connect' transport resilience."""
    script = """
import {
  SPOTIFY_AUTH_STORAGE_KEY,
  SPOTIFY_SCOPES,
  clearProactiveRefreshTimer,
  logoutSpotify,
} from './src/services/spotifyAuth.ts';
import { SpotifyPlayerService } from './src/services/spotifyPlayer.ts';

const hadOriginalWindow = 'window' in globalThis;
const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

const storageMap = new Map();
const mockLocalStorage = {
  getItem: (key) => (storageMap.has(key) ? storageMap.get(key) : null),
  setItem: (key, value) => {
    storageMap.set(key, String(value));
  },
  removeItem: (key) => {
    storageMap.delete(key);
  },
  clear: () => {
    storageMap.clear();
  },
  key: (index) => Array.from(storageMap.keys())[index] ?? null,
  get length() {
    return storageMap.size;
  },
};

globalThis.window = { localStorage: mockLocalStorage };
mockLocalStorage.setItem(
  SPOTIFY_AUTH_STORAGE_KEY,
  JSON.stringify({
    accessToken: 'oracle-valid-oauth-token',
    refreshToken: 'oracle-valid-refresh-token',
    expiresAt: Date.now() + 3600_000,
    tokenType: 'Bearer',
    scope: SPOTIFY_SCOPES,
    clientId: 'oracle-client-id',
  }),
);

const fetchLog = [];
let playPutCount = 0;
let transferPutCount = 0;

globalThis.fetch = async (url, init = {}) => {
  const urlStr = String(url);
  const method = (init.method || 'GET').toUpperCase();
  const headers = init.headers || {};
  const authHeader =
    typeof headers.get === 'function'
      ? headers.get('Authorization')
      : headers.Authorization || headers.authorization || null;
  const bodyText = typeof init.body === 'string' ? init.body : null;

  fetchLog.push({
    url: urlStr,
    method,
    authHeader,
    body: bodyText ? JSON.parse(bodyText) : null,
  });

  if (urlStr === 'https://api.spotify.com/v1/me/player/devices' && method === 'GET') {
    return new Response(
      JSON.stringify({
        devices: [
          {
            id: 'restricted-speaker-0',
            name: 'Restricted Speaker',
            is_active: true,
            is_restricted: true,
            type: 'Speaker',
          },
          {
            id: 'inactive-mobile-2',
            name: 'Mobile Phone',
            is_active: false,
            is_restricted: false,
            type: 'Smartphone',
          },
          {
            id: 'linux-desktop-dev-1',
            name: 'Linux Desktop',
            is_active: true,
            is_restricted: false,
            type: 'Computer',
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (urlStr.startsWith('https://api.spotify.com/v1/me/player/play') && method === 'PUT') {
    playPutCount += 1;
    // 1st & 3rd play attempts return 404 to exercise both transfer-playback and discovery recovery paths
    if (playPutCount === 1 || playPutCount === 3) {
      return new Response(
        JSON.stringify({ error: { status: 404, message: 'Device not found' } }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(null, { status: 204 });
  }

  if (urlStr === 'https://api.spotify.com/v1/me/player' && method === 'PUT') {
    transferPutCount += 1;
    // 1st transfer succeeds (204); 2nd fails (404) so playTrack falls through to discoverConnectDevice()
    if (transferPutCount === 1) {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }

  if (urlStr.startsWith('https://api.spotify.com/v1/me/player/pause') && method === 'PUT') {
    return new Response(null, { status: 204 });
  }

  if (urlStr.startsWith('https://api.spotify.com/v1/me/player/volume') && method === 'PUT') {
    return new Response(null, { status: 204 });
  }

  return new Response('Unexpected URL', { status: 500 });
};

const service = new SpotifyPlayerService();
const readyCallbacks = [];
service.setCallbacks({
  onReady: (id, name) => readyCallbacks.push({ id, name }),
});

try {
  const discovered = await service.discoverConnectDevice('oracle-client-id');
  const stateAfterDiscover = {
    transportMode: service.getTransportMode(),
    deviceId: service.getDeviceId(),
    deviceName: service.getDeviceName(),
    isReady: service.isReady(),
  };

  // Path 1: 404 -> PUT /v1/me/player (204) -> retry play (204)
  await service.playTrack('spotify:track:4QcBuV31ukMvsvviytKjWx', 32100, 'oracle-client-id');

  // Path 2: 404 -> PUT /v1/me/player (404) -> discoverConnectDevice() -> retry play (204)
  await service.playTrack('spotify:track:4uLU6hMCjMI75M1A2tKUQC', 15000, 'oracle-client-id');

  // Pause in 'connect' mode
  await service.pause();

  // Throttled setVolume in 'connect' mode: 4 rapid calls -> 1 leading + 1 trailing after throttle window
  await service.setVolume(0.8);
  await service.setVolume(0.55);
  await service.setVolume(0.35);
  await service.setVolume(0.2);

  const volumeCallsImmediate = fetchLog.filter((entry) =>
    entry.url.startsWith('https://api.spotify.com/v1/me/player/volume'),
  ).length;

  await new Promise((resolve) => setTimeout(resolve, 260));

  const volumeCallsAfterTimer = fetchLog.filter((entry) =>
    entry.url.startsWith('https://api.spotify.com/v1/me/player/volume'),
  );

  console.log(JSON.stringify({
    discovered,
    stateAfterDiscover,
    readyCallbacks,
    volumeCallsImmediate,
    volumeCallsAfterTimer,
    fetchLog,
  }));
} finally {
  service.disconnect();
  logoutSpotify();
  clearProactiveRefreshTimer();
  globalThis.fetch = originalFetch;
  if (hadOriginalWindow) {
    globalThis.window = originalWindow;
  } else {
    delete globalThis.window;
  }
}
"""
    res = run_ts_script(script, timeout=30)

    expected_device = {"id": "linux-desktop-dev-1", "name": "Linux Desktop"}
    if res["discovered"] != expected_device:
        raise AssertionError(
            f"discoverConnectDevice() selected wrong device: expected {expected_device!r}, got {res['discovered']!r}"
        )

    state = res["stateAfterDiscover"]
    if (
        state["transportMode"] != "connect"
        or state["deviceId"] != "linux-desktop-dev-1"
        or state["deviceName"] != "Linux Desktop"
        or state["isReady"] is not True
    ):
        raise AssertionError(f"Unexpected SpotifyPlayerService state after discoverConnectDevice(): {state!r}")

    if expected_device not in res["readyCallbacks"]:
        raise AssertionError(
            f"Expected onReady callback with {expected_device!r}, got {res['readyCallbacks']!r}"
        )

    fetch_log = res["fetchLog"]
    for entry in fetch_log:
        if entry["authHeader"] != "Bearer oracle-valid-oauth-token":
            raise AssertionError(f"Missing/incorrect Bearer token on fetch request: {entry!r}")

    device_requests = [
        e for e in fetch_log if e["url"] == "https://api.spotify.com/v1/me/player/devices" and e["method"] == "GET"
    ]
    if len(device_requests) != 2:
        raise AssertionError(
            f"Expected 2 GET /v1/me/player/devices requests (initial + 404 fallback), got {len(device_requests)}"
        )

    play_requests = [
        e for e in fetch_log if e["url"].startswith("https://api.spotify.com/v1/me/player/play") and e["method"] == "PUT"
    ]
    if len(play_requests) != 4:
        raise AssertionError(
            f"Expected 4 PUT /v1/me/player/play requests (two 404s + two 204 retries), got {len(play_requests)}"
        )
    if play_requests[0]["url"] != "https://api.spotify.com/v1/me/player/play?device_id=linux-desktop-dev-1":
        raise AssertionError(f"Unexpected play URL: {play_requests[0]['url']!r}")
    if play_requests[0]["body"] != {
        "uris": ["spotify:track:4QcBuV31ukMvsvviytKjWx"],
        "position_ms": 32100,
    }:
        raise AssertionError(f"Unexpected play payload: {play_requests[0]['body']!r}")

    transfer_requests = [
        e for e in fetch_log if e["url"] == "https://api.spotify.com/v1/me/player" and e["method"] == "PUT"
    ]
    if len(transfer_requests) != 2:
        raise AssertionError(
            f"Expected 2 PUT /v1/me/player transfer requests on 404 recovery, got {len(transfer_requests)}"
        )
    if transfer_requests[0]["body"] != {"device_ids": ["linux-desktop-dev-1"], "play": False}:
        raise AssertionError(f"Unexpected transfer payload: {transfer_requests[0]['body']!r}")

    pause_requests = [
        e for e in fetch_log if e["url"].startswith("https://api.spotify.com/v1/me/player/pause") and e["method"] == "PUT"
    ]
    if len(pause_requests) != 1 or pause_requests[0]["url"] != "https://api.spotify.com/v1/me/player/pause?device_id=linux-desktop-dev-1":
        raise AssertionError(f"Expected 1 PUT /v1/me/player/pause for Linux Desktop, got {pause_requests!r}")

    if res["volumeCallsImmediate"] != 1:
        raise AssertionError(
            f"Expected exactly 1 immediate leading volume call before throttle timer, got {res['volumeCallsImmediate']}"
        )

    vol_calls = res["volumeCallsAfterTimer"]
    expected_vol_urls = [
        "https://api.spotify.com/v1/me/player/volume?volume_percent=80&device_id=linux-desktop-dev-1",
        "https://api.spotify.com/v1/me/player/volume?volume_percent=20&device_id=linux-desktop-dev-1",
    ]
    actual_vol_urls = [e["url"] for e in vol_calls]
    if actual_vol_urls != expected_vol_urls:
        raise AssertionError(
            f"Throttled Connect setVolume() mismatch: expected {expected_vol_urls!r}, got {actual_vol_urls!r}"
        )


def check_store_custom_soundboard_groups_crud_and_migration() -> None:
    """Oracle 14: Verify useAppStore SoundboardGroup CRUD, ordering, and safe pad fallback migration."""
    script = """
import { DEFAULT_SOUNDBOARD_GROUPS, PAD_CATEGORY_LABELS } from './src/data/defaults.ts';
import { useAppStore } from './src/store/useAppStore.ts';

useAppStore.getState().resetToDefaults();
const initialGroups = useAppStore.getState().settings.soundboardGroups.map((g) => ({ ...g }));

// 1. Add custom groups (explicit customId and auto-generated slug id)
const introId = useAppStore.getState().addSoundboardGroup('Intro & Uppvärmning', 'group-intro');
const pauseId = useAppStore.getState().addSoundboardGroup('Pausunderhållning');

// Duplicate & event-category protection
const dupByLabelId = useAppStore.getState().addSoundboardGroup('  intro & uppvärmning  ');
const dupByCustomId = useAppStore.getState().addSoundboardGroup('Annat Namn', 'group-intro');
const emptyLabelId = useAppStore.getState().addSoundboardGroup('   ');
const forbiddenEventCustomId = useAppStore.getState().addSoundboardGroup('Temp Event Guard', 'goal_home');
const groupsAfterForbiddenAttempt = useAppStore.getState().settings.soundboardGroups.map((g) => g.id);
if (forbiddenEventCustomId) {
  useAppStore.getState().deleteSoundboardGroup(forbiddenEventCustomId);
}

const groupsAfterAdd = useAppStore.getState().settings.soundboardGroups.map((g) => ({ ...g }));

// 2. Update label (and verify blank update is ignored)
useAppStore.getState().updateSoundboardGroup('group-intro', 'Intro & Entré');
useAppStore.getState().updateSoundboardGroup('group-intro', '   ');
const introAfterUpdate = useAppStore.getState().settings.soundboardGroups.find((g) => g.id === 'group-intro') ?? null;

// 3. Move groups (up, down, and boundary no-ops)
const idsBeforeMoves = useAppStore.getState().settings.soundboardGroups.map((g) => g.id);
useAppStore.getState().moveSoundboardGroup(idsBeforeMoves[0], 'up');
const idsAfterTopBoundaryUp = useAppStore.getState().settings.soundboardGroups.map((g) => g.id);

useAppStore.getState().moveSoundboardGroup(pauseId, 'down');
const idsAfterBottomBoundaryDown = useAppStore.getState().settings.soundboardGroups.map((g) => g.id);

useAppStore.getState().moveSoundboardGroup('group-intro', 'up');
const idsAfterMoveIntroUp = useAppStore.getState().settings.soundboardGroups.map((g) => g.id);

useAppStore.getState().moveSoundboardGroup('group-intro', 'down');
const idsAfterMoveIntroDown = useAppStore.getState().settings.soundboardGroups.map((g) => g.id);

// 4. Add SoundPads assigned to the custom groups
useAppStore.getState().addSoundPad({
  id: 'pad-intro-1',
  label: 'Intro Låt 1',
  category: 'group-intro',
  color: '#2563eb',
  volume: 0.9,
  triggerFlow: null,
  hotkey: 'Digit7',
  tracks: [
    {
      trackUri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
      title: 'Intro Song 1',
      artist: 'Arena Band',
      startTimeMs: 5000,
    },
  ],
});
useAppStore.getState().addSoundPad({
  id: 'pad-intro-2',
  label: 'Intro Låt 2',
  category: 'group-intro',
  color: '#1d4ed8',
  volume: 0.8,
  triggerFlow: null,
  tracks: [
    {
      trackUri: 'spotify:track:2KH16WveTQWT6KOG9Rg6e2',
      title: 'Intro Song 2',
      artist: 'Warmup DJ',
      startTimeMs: 10000,
    },
  ],
});
useAppStore.getState().addSoundPad({
  id: 'pad-pause-1',
  label: 'Paus Låt 1',
  category: pauseId,
  color: '#059669',
  volume: 0.85,
  triggerFlow: null,
  hotkey: 'Digit8',
  tracks: [
    {
      trackUri: 'spotify:track:5CQ30WqJwcep0pYcV4AMNc',
      title: 'Pause Song',
      artist: 'Arena Mix',
      startTimeMs: 12000,
    },
  ],
});

const padCountBeforeDelete = useAppStore.getState().soundPads.length;

// 5a. Delete 'group-intro' with explicit fallback to pauseId -> pads must migrate safely without deletion
useAppStore.getState().deleteSoundboardGroup('group-intro', pauseId);
const groupsAfterDeleteIntro = useAppStore.getState().settings.soundboardGroups.map((g) => g.id);
const padsAfterDeleteIntro = useAppStore.getState().soundPads.map((p) => ({ ...p }));

// 5b. Delete pauseId WITHOUT explicit fallback -> pads migrate safely to remainingGroups[0].id
const expectedAutoFallbackId = groupsAfterDeleteIntro[0];
useAppStore.getState().deleteSoundboardGroup(pauseId);
const groupsAfterDeletePause = useAppStore.getState().settings.soundboardGroups.map((g) => g.id);
const padsAfterDeletePause = useAppStore.getState().soundPads.map((p) => ({ ...p }));

// 5c. Delete all remaining groups down to and including the final group -> auto-creates 'misc' fallback & migrates pads safely
for (const gid of [...groupsAfterDeletePause]) {
  useAppStore.getState().deleteSoundboardGroup(gid);
}
const groupsAfterDeleteAll = useAppStore.getState().settings.soundboardGroups.map((g) => ({ ...g }));
const padsAfterDeleteAll = useAppStore.getState().soundPads.map((p) => ({ ...p }));

console.log(JSON.stringify({
  defaultGroups: DEFAULT_SOUNDBOARD_GROUPS,
  miscBuiltinLabel: PAD_CATEGORY_LABELS.misc,
  initialGroups,
  introId,
  pauseId,
  dupByLabelId,
  dupByCustomId,
  emptyLabelId,
  forbiddenEventCustomId,
  groupsAfterForbiddenAttempt,
  groupsAfterAdd,
  introAfterUpdate,
  idsBeforeMoves,
  idsAfterTopBoundaryUp,
  idsAfterBottomBoundaryDown,
  idsAfterMoveIntroUp,
  idsAfterMoveIntroDown,
  padCountBeforeDelete,
  groupsAfterDeleteIntro,
  padsAfterDeleteIntro,
  expectedAutoFallbackId,
  groupsAfterDeletePause,
  padsAfterDeletePause,
  groupsAfterDeleteAll,
  padsAfterDeleteAll,
}));
"""
    res = run_ts_script(script)

    if res["initialGroups"] != res["defaultGroups"]:
        raise AssertionError(f"Unexpected initial soundboardGroups: {res['initialGroups']!r}")
    if res["introId"] != "group-intro":
        raise AssertionError(f"Expected custom group id 'group-intro', got {res['introId']!r}")
    if not isinstance(res["pauseId"], str) or not res["pauseId"] or res["pauseId"] == "group-intro":
        raise AssertionError(f"Expected non-empty unique generated group id for pause group, got {res['pauseId']!r}")

    if res["dupByLabelId"] != "group-intro" or res["dupByCustomId"] != "group-intro":
        raise AssertionError(
            f"addSoundboardGroup did not deduplicate existing group: labelDup={res['dupByLabelId']!r}, idDup={res['dupByCustomId']!r}"
        )
    if res["emptyLabelId"] != "":
        raise AssertionError(f"Expected '' for blank group label, got {res['emptyLabelId']!r}")
    if res["forbiddenEventCustomId"] == "goal_home" or "goal_home" in res["groupsAfterForbiddenAttempt"]:
        raise AssertionError(
            f"Event category 'goal_home' must never be accepted as a soundboardGroup id: {res['groupsAfterForbiddenAttempt']!r}"
        )

    expected_after_add = [
        *res["defaultGroups"],
        {"id": "group-intro", "label": "Intro & Uppvärmning", "isBuiltin": False},
        {"id": res["pauseId"], "label": "Pausunderhållning", "isBuiltin": False},
    ]
    if res["groupsAfterAdd"] != expected_after_add:
        raise AssertionError(
            f"soundboardGroups after add mismatch:\nEXPECTED: {expected_after_add!r}\nACTUAL:   {res['groupsAfterAdd']!r}"
        )

    if res["introAfterUpdate"] != {"id": "group-intro", "label": "Intro & Entré", "isBuiltin": False}:
        raise AssertionError(f"updateSoundboardGroup failed: {res['introAfterUpdate']!r}")

    ids_base = res["idsBeforeMoves"]
    if res["idsAfterTopBoundaryUp"] != ids_base or res["idsAfterBottomBoundaryDown"] != ids_base:
        raise AssertionError("moveSoundboardGroup boundary up/down was not a no-op")

    expected_after_up = list(ids_base)
    intro_idx = expected_after_up.index("group-intro")
    expected_after_up[intro_idx - 1], expected_after_up[intro_idx] = (
        expected_after_up[intro_idx],
        expected_after_up[intro_idx - 1],
    )
    if res["idsAfterMoveIntroUp"] != expected_after_up:
        raise AssertionError(
            f"moveSoundboardGroup('group-intro', 'up') mismatch: expected {expected_after_up!r}, got {res['idsAfterMoveIntroUp']!r}"
        )
    if res["idsAfterMoveIntroDown"] != ids_base:
        raise AssertionError(
            f"moveSoundboardGroup('group-intro', 'down') did not restore original order: expected {ids_base!r}, got {res['idsAfterMoveIntroDown']!r}"
        )

    pad_count = res["padCountBeforeDelete"]
    if "group-intro" in res["groupsAfterDeleteIntro"]:
        raise AssertionError("deleteSoundboardGroup('group-intro', pauseId) did not remove 'group-intro'")

    pads_after_intro_del = res["padsAfterDeleteIntro"]
    if len(pads_after_intro_del) != pad_count:
        raise AssertionError(
            f"deleteSoundboardGroup deleted pads instead of migrating: before={pad_count}, after={len(pads_after_intro_del)}"
        )
    pads_map_1 = {p["id"]: p for p in pads_after_intro_del}
    if (
        pads_map_1["pad-intro-1"]["category"] != res["pauseId"]
        or pads_map_1["pad-intro-1"].get("hotkey") != "7"
        or pads_map_1["pad-intro-1"]["tracks"][0]["title"] != "Intro Song 1"
        or pads_map_1["pad-intro-2"]["category"] != res["pauseId"]
        or pads_map_1["pad-intro-2"]["tracks"][0]["title"] != "Intro Song 2"
    ):
        raise AssertionError(f"Pads in 'group-intro' did not migrate safely to {res['pauseId']!r}: {pads_map_1!r}")

    if res["pauseId"] in res["groupsAfterDeletePause"]:
        raise AssertionError(f"deleteSoundboardGroup({res['pauseId']!r}) did not remove group")

    pads_after_pause_del = res["padsAfterDeletePause"]
    if len(pads_after_pause_del) != pad_count:
        raise AssertionError(
            f"Auto-fallback deleteSoundboardGroup deleted pads: before={pad_count}, after={len(pads_after_pause_del)}"
        )
    pads_map_2 = {p["id"]: p for p in pads_after_pause_del}
    auto_fb = res["expectedAutoFallbackId"]
    for pid in ("pad-intro-1", "pad-intro-2", "pad-pause-1"):
        if pads_map_2[pid]["category"] != auto_fb:
            raise AssertionError(
                f"Pad {pid!r} expected to migrate to auto-fallback {auto_fb!r}, got {pads_map_2[pid]['category']!r}"
            )
    if pads_map_2["pad-pause-1"].get("hotkey") != "8":
        raise AssertionError(f"Pad 'pad-pause-1' lost hotkey after migration: {pads_map_2['pad-pause-1']!r}")

    if res["groupsAfterDeleteAll"] != [{"id": "misc", "label": res["miscBuiltinLabel"], "isBuiltin": True}]:
        raise AssertionError(
            f"Deleting final remaining group did not restore safe 'misc' fallback group: {res['groupsAfterDeleteAll']!r}"
        )
    pads_after_all_del = res["padsAfterDeleteAll"]
    if len(pads_after_all_del) != pad_count:
        raise AssertionError(
            f"Deleting all groups lost SoundPads: before={pad_count}, after={len(pads_after_all_del)}"
        )
    pads_map_3 = {p["id"]: p for p in pads_after_all_del}
    for pid in ("pad-intro-1", "pad-intro-2", "pad-pause-1"):
        if pads_map_3[pid]["category"] != "misc":
            raise AssertionError(
                f"Pad {pid!r} expected to migrate to 'misc' fallback when final group deleted, got {pads_map_3[pid]['category']!r}"
            )


def check_store_custom_groups_profiles_and_json_roundtrip() -> None:
    """Oracle 15: Verify MatchProfile switching with distinct custom soundboardGroups and full JSON export/import round-trip."""
    script = """
import { DEFAULT_SOUNDBOARD_GROUPS } from './src/data/defaults.ts';
import { useAppStore } from './src/store/useAppStore.ts';

useAppStore.getState().resetToDefaults();

// 1. Configure Profile A with custom group 'group-intro' moved to index 0 and assigned pad
useAppStore.getState().addSoundboardGroup('Intro & Uppvärmning', 'group-intro');
for (let i = 0; i < 6; i += 1) {
  useAppStore.getState().moveSoundboardGroup('group-intro', 'up');
}
useAppStore.getState().addSoundPad({
  id: 'pad-prof-a-intro',
  label: 'A-Lag Intro',
  category: 'group-intro',
  color: '#2563eb',
  volume: 0.95,
  triggerFlow: null,
  hotkey: 'Digit5',
  tracks: [
    {
      trackUri: 'spotify:track:1111111111111111111111',
      title: 'Profile A Intro Anthem',
      artist: 'Arena A',
      startTimeMs: 12000,
    },
  ],
});
const profileAId = useAppStore.getState().saveCurrentAsMatchProfile('Profil A Intro', 'Senior', false);

// 2. Configure Profile B with distinct custom group 'group-paus-show', renamed builtin group 'organ', and assigned pad
useAppStore.getState().deleteSoundboardGroup('group-intro', 'misc');
useAppStore.getState().addSoundboardGroup('Pausshow & Tävling', 'group-paus-show');
useAppStore.getState().updateSoundboardGroup('organ', 'Arenaorgel Live');
useAppStore.getState().deleteSoundPad('pad-prof-a-intro');
useAppStore.getState().addSoundPad({
  id: 'pad-prof-b-paus',
  label: 'Pausshow Låt',
  category: 'group-paus-show',
  color: '#059669',
  volume: 0.85,
  triggerFlow: null,
  hotkey: 'Digit6',
  tracks: [
    {
      trackUri: 'spotify:track:2222222222222222222222',
      title: 'Profile B Intermission',
      artist: 'Arena B',
      startTimeMs: 30000,
    },
  ],
});
const profileBId = useAppStore.getState().saveCurrentAsMatchProfile('Profil B Paus', 'Ungdom', false);

function captureSnapshot() {
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

// 3. Deterministic MatchProfile switching: A -> B -> A -> default -> A
const actA1 = useAppStore.getState().activateMatchProfile(profileAId);
const stateA1 = captureSnapshot();

const actB1 = useAppStore.getState().activateMatchProfile(profileBId);
const stateB1 = captureSnapshot();

const actA2 = useAppStore.getState().activateMatchProfile(profileAId);
const stateA2 = captureSnapshot();

const actDefault = useAppStore.getState().activateMatchProfile('profile-u12-standard');
const groupsOnDefault = useAppStore.getState().settings.soundboardGroups.map((g) => ({ ...g }));

const actA3 = useAppStore.getState().activateMatchProfile(profileAId);
const beforeExport = captureSnapshot();

// 4. Full JSON export/import round-trip (exportConfigJson -> resetToDefaults -> importConfigJson)
const exportedJson = useAppStore.getState().exportConfigJson();
const parsedExport = JSON.parse(exportedJson);

useAppStore.getState().resetToDefaults();
const wipedGroups = useAppStore.getState().settings.soundboardGroups.map((g) => ({ ...g }));
const wipedHasProfAPad = useAppStore.getState().soundPads.some((p) => p.id === 'pad-prof-a-intro');

const importedReturn = useAppStore.getState().importConfigJson(exportedJson);
const afterImport = captureSnapshot();

// Verify switching to Profile B still works cleanly after importConfigJson
const actBAfterImport = useAppStore.getState().activateMatchProfile(profileBId);
const stateBAfterImport = captureSnapshot();

console.log(JSON.stringify({
  defaultGroups: DEFAULT_SOUNDBOARD_GROUPS,
  profileAId,
  profileBId,
  actA1,
  actB1,
  actA2,
  actDefault,
  actA3,
  stateA1,
  stateB1,
  stateA2,
  groupsOnDefault,
  beforeExport,
  parsedExport,
  wipedGroups,
  wipedHasProfAPad,
  importedReturn: {
    teams: importedReturn.teams,
    soundPads: importedReturn.soundPads,
    settings: importedReturn.settings,
    savedRosters: importedReturn.savedRosters ?? [],
    matchProfiles: importedReturn.matchProfiles ?? [],
    activeProfileId: importedReturn.activeProfileId ?? null,
  },
  afterImport,
  actBAfterImport,
  stateBAfterImport,
}));
"""
    res = run_ts_script(script)

    for key in ("actA1", "actB1", "actA2", "actDefault", "actA3", "actBAfterImport"):
        if res[key] is not True:
            raise AssertionError(f"activateMatchProfile failed for {key}")

    a1 = res["stateA1"]
    b1 = res["stateB1"]
    a2 = res["stateA2"]

    if a1 != a2:
        raise AssertionError("MatchProfile switching A -> B -> A was not deterministic for custom soundboardGroups/pads")

    a1_groups = a1["settings"]["soundboardGroups"]
    a1_group_ids = [g["id"] for g in a1_groups]
    if a1_groups[0] != {"id": "group-intro", "label": "Intro & Uppvärmning", "isBuiltin": False}:
        raise AssertionError(f"Profile A expected 'group-intro' at index 0, got {a1_groups[0]!r}")
    if "group-paus-show" in a1_group_ids:
        raise AssertionError(f"Profile A leaked 'group-paus-show': {a1_group_ids!r}")
    a1_organ = next((g for g in a1_groups if g["id"] == "organ"), None)
    if not a1_organ or a1_organ["label"] != "Orgel / Publikpepp":
        raise AssertionError(f"Profile A expected default 'organ' label, got {a1_organ!r}")
    a1_pads = {p["id"]: p for p in a1["soundPads"]}
    if "pad-prof-a-intro" not in a1_pads or "pad-prof-b-paus" in a1_pads:
        raise AssertionError(f"Profile A soundPads mismatch: {list(a1_pads.keys())!r}")
    if a1_pads["pad-prof-a-intro"]["category"] != "group-intro" or a1_pads["pad-prof-a-intro"].get("hotkey") != "5":
        raise AssertionError(f"Profile A pad category/hotkey mismatch: {a1_pads['pad-prof-a-intro']!r}")

    b1_groups = b1["settings"]["soundboardGroups"]
    b1_group_ids = [g["id"] for g in b1_groups]
    if "group-paus-show" not in b1_group_ids or "group-intro" in b1_group_ids:
        raise AssertionError(f"Profile B soundboardGroups mismatch: {b1_group_ids!r}")
    b1_paus = next((g for g in b1_groups if g["id"] == "group-paus-show"), None)
    b1_organ = next((g for g in b1_groups if g["id"] == "organ"), None)
    if b1_paus != {"id": "group-paus-show", "label": "Pausshow & Tävling", "isBuiltin": False}:
        raise AssertionError(f"Profile B 'group-paus-show' mismatch: {b1_paus!r}")
    if not b1_organ or b1_organ["label"] != "Arenaorgel Live":
        raise AssertionError(f"Profile B renamed 'organ' label mismatch: {b1_organ!r}")
    b1_pads = {p["id"]: p for p in b1["soundPads"]}
    if "pad-prof-b-paus" not in b1_pads or "pad-prof-a-intro" in b1_pads:
        raise AssertionError(f"Profile B soundPads mismatch: {list(b1_pads.keys())!r}")
    if b1_pads["pad-prof-b-paus"]["category"] != "group-paus-show" or b1_pads["pad-prof-b-paus"].get("hotkey") != "6":
        raise AssertionError(f"Profile B pad category/hotkey mismatch: {b1_pads['pad-prof-b-paus']!r}")

    if res["groupsOnDefault"] != res["defaultGroups"]:
        raise AssertionError(
            f"Default profile U12 soundboardGroups mismatch: expected {res['defaultGroups']!r}, got {res['groupsOnDefault']!r}"
        )

    if res["wipedGroups"] != res["defaultGroups"] or res["wipedHasProfAPad"] is not False:
        raise AssertionError("resetToDefaults did not wipe custom soundboardGroups/pads prior to importConfigJson check")

    parsed_export_groups = res["parsedExport"]["settings"]["soundboardGroups"]
    if parsed_export_groups[0] != {"id": "group-intro", "label": "Intro & Uppvärmning", "isBuiltin": False}:
        raise AssertionError(f"Exported JSON missing custom group-intro at index 0: {parsed_export_groups!r}")

    before = res["beforeExport"]
    for label, actual in (
        ("importConfigJson return value", res["importedReturn"]),
        ("store after importConfigJson", res["afterImport"]),
    ):
        if actual["settings"]["soundboardGroups"] != before["settings"]["soundboardGroups"]:
            raise AssertionError(f"soundboardGroups mismatch in {label}")
        if actual["soundPads"] != before["soundPads"]:
            raise AssertionError(f"soundPads mismatch in {label}")
        if actual["matchProfiles"] != before["matchProfiles"]:
            raise AssertionError(f"matchProfiles mismatch in {label}")
        if actual["activeProfileId"] != res["profileAId"]:
            raise AssertionError(f"activeProfileId mismatch in {label}: {actual['activeProfileId']!r}")

    imported_pad_a = next((p for p in res["afterImport"]["soundPads"] if p["id"] == "pad-prof-a-intro"), None)
    if not imported_pad_a or imported_pad_a["category"] != "group-intro" or imported_pad_a.get("hotkey") != "5":
        raise AssertionError(f"Imported pad-prof-a-intro category/hotkey lost: {imported_pad_a!r}")

    if res["stateBAfterImport"] != b1:
        raise AssertionError("Activating Profile B after JSON import did not restore identical groups and pads")


def check_local_audio_storage() -> None:
    """Oracle 16: Verify localAudioStorage CRUD, metadata parsing, MIME inference, and playback URL caching."""
    script = """
import { isLocalAudioUri } from './src/utils/domain.ts';
import {
  deleteLocalAudioFile,
  getLocalAudioPlaybackUrl,
  getLocalAudioRecord,
  listLocalAudioFiles,
  saveLocalAudioFile,
} from './src/services/localAudioStorage.ts';

const bytesA = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
const bytesB = new Uint8Array([82, 73, 70, 70, 36, 0, 0, 0]);

const metaA = await saveLocalAudioFile(
  {
    name: 'Zombie Nation - Kernkraft 400.mp3',
    type: 'audio/mpeg',
    size: bytesA.byteLength,
    arrayBuffer: async () => bytesA.buffer.slice(0),
  },
  'local:audio:oracle_local_kernkraft',
);

const metaB = await saveLocalAudioFile({
  name: 'Goal_Horn_Sundsvall.wav',
  arrayBuffer: async () => bytesB.buffer.slice(0),
});

try {
  const recordA = await getLocalAudioRecord(metaA.trackUri);
  const recordB = await getLocalAudioRecord(metaB.trackUri);
  const invalidRecord = await getLocalAudioRecord('spotify:track:4uLU6hMCjMI75M1A2tKUQC');

  const urlA1 = await getLocalAudioPlaybackUrl(metaA.trackUri);
  const urlA2 = await getLocalAudioPlaybackUrl(metaA.trackUri);
  const urlB = await getLocalAudioPlaybackUrl(metaB.trackUri);
  const missingUrl = await getLocalAudioPlaybackUrl('local:audio:does_not_exist_999');

  const listedBeforeDelete = await listLocalAudioFiles();

  await deleteLocalAudioFile(metaA.trackUri);

  const recordAAfterDelete = await getLocalAudioRecord(metaA.trackUri);
  const urlAAfterDelete = await getLocalAudioPlaybackUrl(metaA.trackUri);
  const listedAfterDelete = await listLocalAudioFiles();

  const getByteLen = (rec) => {
    if (!rec || !rec.data) return -1;
    if (rec.data instanceof ArrayBuffer) return rec.data.byteLength;
    if (ArrayBuffer.isView(rec.data)) return rec.data.byteLength;
    if (typeof Blob !== 'undefined' && rec.data instanceof Blob) return rec.data.size;
    return -1;
  };

  console.log(JSON.stringify({
    metaA,
    metaB,
    metaAUriValid: isLocalAudioUri(metaA.trackUri),
    metaBUriValid: isLocalAudioUri(metaB.trackUri),
    recordAInfo: recordA
      ? {
          trackUri: recordA.trackUri,
          fileName: recordA.fileName,
          mimeType: recordA.mimeType,
          sizeBytes: recordA.sizeBytes,
          createdAt: recordA.createdAt,
          dataByteLength: getByteLen(recordA),
        }
      : null,
    recordBInfo: recordB
      ? {
          trackUri: recordB.trackUri,
          fileName: recordB.fileName,
          mimeType: recordB.mimeType,
          sizeBytes: recordB.sizeBytes,
          createdAt: recordB.createdAt,
          dataByteLength: getByteLen(recordB),
        }
      : null,
    invalidRecord,
    urlA1,
    urlA2,
    urlB,
    missingUrl,
    listedBeforeDeleteHasDataKey: listedBeforeDelete.some((item) => 'data' in item),
    listedBeforeDelete,
    recordAAfterDelete,
    urlAAfterDelete,
    listedAfterDelete,
  }));
} finally {
  await deleteLocalAudioFile(metaA.trackUri);
  await deleteLocalAudioFile(metaB.trackUri);
}
"""
    res = run_ts_script(script)

    meta_a = res["metaA"]
    meta_b = res["metaB"]
    if not res["metaAUriValid"] or not res["metaBUriValid"]:
        raise AssertionError(f"Saved local audio URIs are invalid: A={meta_a}, B={meta_b}")

    if meta_a != {
        "trackUri": "local:audio:oracle_local_kernkraft",
        "fileName": "Zombie Nation - Kernkraft 400.mp3",
        "mimeType": "audio/mpeg",
        "title": "Kernkraft 400",
        "artist": "Zombie Nation",
    }:
        raise AssertionError(f"Unexpected saveLocalAudioFile metadata for A: {meta_a!r}")

    if (
        meta_b["fileName"] != "Goal_Horn_Sundsvall.wav"
        or meta_b["mimeType"] != "audio/wav"
        or meta_b["title"] != "Goal Horn Sundsvall"
        or meta_b["artist"] != "Lokal ljudfil"
    ):
        raise AssertionError(f"Unexpected saveLocalAudioFile metadata/MIME inference for B: {meta_b!r}")

    rec_a = res["recordAInfo"]
    rec_b = res["recordBInfo"]
    if (
        not rec_a
        or rec_a["trackUri"] != meta_a["trackUri"]
        or rec_a["fileName"] != "Zombie Nation - Kernkraft 400.mp3"
        or rec_a["mimeType"] != "audio/mpeg"
        or rec_a["sizeBytes"] != 16
        or rec_a["dataByteLength"] != 16
        or not rec_a["createdAt"]
    ):
        raise AssertionError(f"Unexpected getLocalAudioRecord for A: {rec_a!r}")

    if (
        not rec_b
        or rec_b["trackUri"] != meta_b["trackUri"]
        or rec_b["mimeType"] != "audio/wav"
        or rec_b["sizeBytes"] != 8
        or rec_b["dataByteLength"] != 8
    ):
        raise AssertionError(f"Unexpected getLocalAudioRecord for B: {rec_b!r}")

    if res["invalidRecord"] is not None:
        raise AssertionError(f"Expected null for non-local URI in getLocalAudioRecord, got {res['invalidRecord']!r}")

    if (
        not isinstance(res["urlA1"], str)
        or not res["urlA1"].startswith("blob:")
        or res["urlA1"] != res["urlA2"]
    ):
        raise AssertionError(f"Expected cached blob: playback URL for A, got {res['urlA1']!r} / {res['urlA2']!r}")

    if not isinstance(res["urlB"], str) or not res["urlB"].startswith("blob:"):
        raise AssertionError(f"Expected blob: playback URL for B, got {res['urlB']!r}")

    if res["missingUrl"] is not None:
        raise AssertionError(f"Expected null playback URL for missing URI, got {res['missingUrl']!r}")

    if res["listedBeforeDeleteHasDataKey"]:
        raise AssertionError("listLocalAudioFiles must strip binary `data` property from records")

    uris_before = {item["trackUri"] for item in res["listedBeforeDelete"]}
    if meta_a["trackUri"] not in uris_before or meta_b["trackUri"] not in uris_before:
        raise AssertionError(f"listLocalAudioFiles missing saved entries: {uris_before!r}")

    if res["recordAAfterDelete"] is not None or res["urlAAfterDelete"] is not None:
        raise AssertionError("deleteLocalAudioFile did not clear record and cached playback URL")

    uris_after = {item["trackUri"] for item in res["listedAfterDelete"]}
    if meta_a["trackUri"] in uris_after or meta_b["trackUri"] not in uris_after:
        raise AssertionError(f"listLocalAudioFiles mismatch after delete: {uris_after!r}")


def check_audio_controller_local_audio_and_ramps() -> None:
    """Oracle 17: Verify AudioController.playAt() with local audio, volume ramps, hardStop, and Spotify setVolume isolation."""
    script = """
import { AudioController } from './src/services/audioController.ts';
import {
  deleteLocalAudioFile,
  getLocalAudioPlaybackUrl,
  saveLocalAudioFile,
} from './src/services/localAudioStorage.ts';

const hadOriginalAudio = 'Audio' in globalThis;
const originalAudio = globalThis.Audio;

const createdAudioInstances = [];

class MockHTMLAudioElement {
  constructor(src) {
    this.src = src;
    this._volume = 1.0;
    this.volumeHistory = [];
    this.currentTime = 0;
    this.duration = 120;
    this.readyState = 1;
    this.paused = true;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.loadCalls = 0;
    this.removedAttributes = [];
    this.listeners = new Map();
    createdAudioInstances.push(this);
  }
  get volume() {
    return this._volume;
  }
  set volume(v) {
    this._volume = v;
    this.volumeHistory.push(v);
  }
  addEventListener(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
  }
  removeEventListener(event, handler) {
    this.listeners.get(event)?.delete(handler);
  }
  async play() {
    this.paused = false;
    this.playCalls += 1;
  }
  pause() {
    this.paused = true;
    this.pauseCalls += 1;
  }
  removeAttribute(name) {
    this.removedAttributes.push(name);
    if (name === 'src') {
      this.src = '';
    }
  }
  load() {
    this.loadCalls += 1;
  }
}

globalThis.Audio = MockHTMLAudioElement;

const savedMeta = await saveLocalAudioFile(
  {
    name: 'Zombie Nation - Kernkraft 400.mp3',
    type: 'audio/mpeg',
    size: 12,
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer,
  },
  'local:audio:oracle_controller_local',
);
const expectedPlaybackUrl = await getLocalAudioPlaybackUrl(savedMeta.trackUri);

const spotifyPlayCalls = [];
const spotifyVolumeCalls = [];
let spotifyPauseCalls = 0;

const mockSpotifyAdapter = {
  isReady: () => true,
  getDeviceId: () => 'spotify-connect-dev-1',
  getDeviceName: () => 'Spotify Desktop',
  playTrack: async (uri, pos) => {
    spotifyPlayCalls.push({ uri, pos });
  },
  pause: async () => {
    spotifyPauseCalls += 1;
  },
  setVolume: async (vol) => {
    spotifyVolumeCalls.push(vol);
  },
};

const controller = new AudioController(mockSpotifyAdapter);

try {
  // 1. Play local audio track at 15000ms, targetVolume 0.9
  await controller.playAt(
    savedMeta.trackUri,
    15000,
    0.9,
    undefined,
    {
      title: savedMeta.title,
      artist: savedMeta.artist,
      sourceType: 'local',
      localFileName: savedMeta.fileName,
      mimeType: savedMeta.mimeType,
    },
  );
  const stateAfterPlay = controller.getState();
  const volHistoryAfterPlay = [...createdAudioInstances[0].volumeHistory];
  const initialAudioPos = createdAudioInstances[0].currentTime;
  const spotifyPauseAfterPlay1 = spotifyPauseCalls;

  // 2. Duck volume to 0.2 (150ms ramp) -> must ramp HTMLAudioElement only, NEVER Spotify setVolume
  await controller.duckVolume(0.2, 150);
  const stateAfterDuck = controller.getState();
  const audioVolAfterDuck = createdAudioInstances[0].volume;

  // 3. Restore volume to 0.95 (150ms ramp) -> must ramp HTMLAudioElement only, NEVER Spotify setVolume
  await controller.restoreVolume(0.95, 150);
  const stateAfterRestore = controller.getState();
  const audioVolAfterRestore = createdAudioInstances[0].volume;

  // 4. Fade out and pause (150ms ramp) -> must pause HTMLAudioElement and NOT call Spotify pause/setVolume
  await controller.fadeOutAndPause(150);
  const stateAfterFadeOut = controller.getState();
  const spotifyPauseAfterFadeOut = spotifyPauseCalls;
  const firstAudioSnapshot = {
    paused: createdAudioInstances[0].paused,
    playCalls: createdAudioInstances[0].playCalls,
    pauseCalls: createdAudioInstances[0].pauseCalls,
    loadCalls: createdAudioInstances[0].loadCalls,
    removedAttributes: createdAudioInstances[0].removedAttributes,
    volumeHistory: createdAudioInstances[0].volumeHistory,
    finalVolume: createdAudioInstances[0].volume,
  };

  // 5. Play again and hardStop()
  await controller.playAt(savedMeta.trackUri, 0, 0.85, undefined, {
    title: savedMeta.title,
    artist: savedMeta.artist,
    sourceType: 'local',
    localFileName: savedMeta.fileName,
    mimeType: savedMeta.mimeType,
  });
  const spotifyPauseAfterPlay2 = spotifyPauseCalls;
  await controller.hardStop();
  const stateAfterHardStop = controller.getState();
  const spotifyPauseAfterHardStop = spotifyPauseCalls;
  const secondAudioSnapshot = {
    paused: createdAudioInstances[1].paused,
    playCalls: createdAudioInstances[1].playCalls,
    pauseCalls: createdAudioInstances[1].pauseCalls,
    loadCalls: createdAudioInstances[1].loadCalls,
    removedAttributes: createdAudioInstances[1].removedAttributes,
  };

  // 6. Missing local audio URI graceful fallback (must still never touch Spotify adapter setVolume/playTrack)
  await controller.playAt('local:audio:missing_oracle_file', 0, 1.0, undefined, {
    title: 'Saknad lokal fil',
    artist: 'Lokal ljudfil',
    sourceType: 'local',
  });
  const stateAfterMissing = controller.getState();
  await controller.hardStop();

  console.log(JSON.stringify({
    expectedPlaybackUrl,
    audioSrc0: createdAudioInstances[0] ? expectedPlaybackUrl : null,
    audioCount: createdAudioInstances.length,
    spotifyPlayCalls,
    spotifyVolumeCalls,
    spotifyPauseAfterPlay1,
    spotifyPauseAfterFadeOut,
    spotifyPauseAfterPlay2,
    spotifyPauseAfterHardStop,
    initialAudioPos,
    volHistoryAfterPlay,
    stateAfterPlay,
    stateAfterDuck,
    audioVolAfterDuck,
    stateAfterRestore,
    audioVolAfterRestore,
    stateAfterFadeOut,
    firstAudioSnapshot,
    stateAfterHardStop,
    secondAudioSnapshot,
    stateAfterMissing,
  }));
} finally {
  controller.dispose();
  await deleteLocalAudioFile(savedMeta.trackUri);
  if (hadOriginalAudio) {
    globalThis.Audio = originalAudio;
  } else {
    delete globalThis.Audio;
  }
}
"""
    res = run_ts_script(script, timeout=30)

    if res["spotifyPlayCalls"]:
        raise AssertionError(
            f"Spotify playTrack() must NEVER be called for local audio files: {res['spotifyPlayCalls']!r}"
        )
    if res["spotifyVolumeCalls"]:
        raise AssertionError(
            f"Spotify setVolume() must NEVER be called during local audio playback/ducking/fade: {res['spotifyVolumeCalls']!r}"
        )
    if res["spotifyPauseAfterPlay1"] != 1:
        raise AssertionError(
            f"Expected Spotify pause() once when switching from ready Spotify to local audio, got {res['spotifyPauseAfterPlay1']}"
        )
    if res["spotifyPauseAfterFadeOut"] != 1:
        raise AssertionError(
            f"fadeOutAndPause() on local audio must NOT call Spotify pause(): count={res['spotifyPauseAfterFadeOut']}"
        )
    if res["spotifyPauseAfterPlay2"] != 2 or res["spotifyPauseAfterHardStop"] != 2:
        raise AssertionError(
            f"Unexpected Spotify pause() counts on 2nd local play + hardStop: {res['spotifyPauseAfterPlay2']}, {res['spotifyPauseAfterHardStop']}"
        )

    if res["audioCount"] != 2:
        raise AssertionError(f"Expected 2 MockHTMLAudioElement instances, got {res['audioCount']}")
    if abs(res["initialAudioPos"] - 15.0) > 1e-6:
        raise AssertionError(f"Expected local audio seek to 15.0s, got {res['initialAudioPos']}")

    s_play = res["stateAfterPlay"]
    track_play = s_play.get("currentTrack") or {}
    if (
        s_play["isPlaying"] is not True
        or s_play["isDucked"] is not False
        or abs(s_play["volume"] - 0.9) > 1e-6
        or s_play["positionMs"] != 15000
        or s_play["error"] is not None
        or track_play.get("trackUri") != "local:audio:oracle_controller_local"
        or track_play.get("sourceType") != "local"
        or track_play.get("localFileName") != "Zombie Nation - Kernkraft 400.mp3"
        or track_play.get("mimeType") != "audio/mpeg"
    ):
        raise AssertionError(f"Unexpected AudioController state after local playAt: {s_play!r}")

    s_duck = res["stateAfterDuck"]
    if (
        s_duck["isPlaying"] is not True
        or s_duck["isDucked"] is not True
        or abs(s_duck["volume"] - 0.2) > 1e-6
        or abs(res["audioVolAfterDuck"] - 0.2) > 1e-6
    ):
        raise AssertionError(f"Unexpected state after local duckVolume: {s_duck!r}, audioVol={res['audioVolAfterDuck']}")

    s_restore = res["stateAfterRestore"]
    if (
        s_restore["isPlaying"] is not True
        or s_restore["isDucked"] is not False
        or abs(s_restore["volume"] - 0.95) > 1e-6
        or abs(res["audioVolAfterRestore"] - 0.95) > 1e-6
    ):
        raise AssertionError(f"Unexpected state after local restoreVolume: {s_restore!r}, audioVol={res['audioVolAfterRestore']}")

    s_fade = res["stateAfterFadeOut"]
    first_audio = res["firstAudioSnapshot"]
    if (
        s_fade["isPlaying"] is not False
        or s_fade["isDucked"] is not False
        or abs(s_fade["volume"] - 0.0) > 1e-6
        or first_audio["paused"] is not True
        or first_audio["pauseCalls"] < 1
        or first_audio["loadCalls"] < 1
        or "src" not in first_audio["removedAttributes"]
        or abs(first_audio["finalVolume"] - 0.0) > 1e-6
        or len(first_audio["volumeHistory"]) < 5
    ):
        raise AssertionError(f"Unexpected state/audio after local fadeOutAndPause: state={s_fade!r}, audio={first_audio!r}")

    s_stop = res["stateAfterHardStop"]
    second_audio = res["secondAudioSnapshot"]
    if (
        s_stop["isPlaying"] is not False
        or s_stop["isDucked"] is not False
        or second_audio["paused"] is not True
        or second_audio["pauseCalls"] < 1
        or "src" not in second_audio["removedAttributes"]
    ):
        raise AssertionError(f"Unexpected state/audio after local hardStop: state={s_stop!r}, audio={second_audio!r}")

    s_missing = res["stateAfterMissing"]
    if (
        s_missing["isPlaying"] is not True
        or (s_missing["currentTrack"] or {}).get("sourceType") != "local"
        or not isinstance(s_missing.get("error"), str)
        or not s_missing["error"].strip()
    ):
        raise AssertionError(f"Unexpected fallback state for missing local audio file: {s_missing!r}")


def check_store_local_audio_json_roundtrip() -> None:
    """Oracle 18: Verify full useAppStore JSON export/import round-trip with local audio track metadata."""
    script = """
import { useAppStore } from './src/store/useAppStore.ts';

useAppStore.getState().resetToDefaults();

// Add a dedicated SoundPad with a local audio track and append a second local track to an existing pad
useAppStore.getState().addSoundPad({
  id: 'pad-local-goal-horn',
  label: 'Lokalt Målhorn',
  category: 'goal_home',
  color: '#2563eb',
  volume: 0.95,
  triggerFlow: 'goal_home',
  hotkey: 'Digit9',
  tracks: [
    {
      trackUri: 'local:audio:oracle_goal_horn_1',
      title: 'Kernkraft 400',
      artist: 'Zombie Nation',
      startTimeMs: 4500,
      sourceType: 'local',
      localFileName: 'Zombie Nation - Kernkraft 400.mp3',
      mimeType: 'audio/mpeg',
    },
  ],
});

useAppStore.getState().addTrackToPad('pad-hype-1', {
  trackUri: 'local:audio:oracle_hype_wav_2',
  title: 'Goal Horn Sundsvall',
  artist: 'Lokal ljudfil',
  startTimeMs: 0,
  sourceType: 'local',
  localFileName: 'Goal_Horn_Sundsvall.wav',
  mimeType: 'audio/wav',
});

const localProfileId = useAppStore.getState().saveCurrentAsMatchProfile(
  'Lokal Ljudprofil',
  'U16',
  false,
);

function captureStoreSnapshot() {
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

const beforeExport = captureStoreSnapshot();
const exportedJson = useAppStore.getState().exportConfigJson();
const parsedExport = JSON.parse(exportedJson);

useAppStore.getState().resetToDefaults();
const wipedHasLocalPad = useAppStore.getState().soundPads.some((p) => p.id === 'pad-local-goal-horn');

const importedReturn = useAppStore.getState().importConfigJson(exportedJson);
const afterImport = captureStoreSnapshot();

// Also switch away to default profile and back to localProfileId to verify profile track metadata preservation
const actDefault = useAppStore.getState().activateMatchProfile('profile-u12-standard');
const defaultHasLocalPad = useAppStore.getState().soundPads.some((p) => p.id === 'pad-local-goal-horn');
const actLocalProfile = useAppStore.getState().activateMatchProfile(localProfileId);
const afterReactivateProfile = captureStoreSnapshot();

console.log(JSON.stringify({
  localProfileId,
  beforeExport,
  parsedExport,
  wipedHasLocalPad,
  importedReturn: {
    teams: importedReturn.teams,
    soundPads: importedReturn.soundPads,
    settings: importedReturn.settings,
    savedRosters: importedReturn.savedRosters ?? [],
    matchProfiles: importedReturn.matchProfiles ?? [],
    activeProfileId: importedReturn.activeProfileId ?? null,
  },
  afterImport,
  actDefault,
  defaultHasLocalPad,
  actLocalProfile,
  afterReactivateProfile,
}));
"""
    res = run_ts_script(script)

    if res["wipedHasLocalPad"] is not False:
        raise AssertionError("resetToDefaults did not clear pad-local-goal-horn before import check")

    if not res["actDefault"] or res["defaultHasLocalPad"] is not False or not res["actLocalProfile"]:
        raise AssertionError("MatchProfile switching check around local audio profile failed")

    exported_pad = next(
        (p for p in res["parsedExport"]["soundPads"] if p["id"] == "pad-local-goal-horn"),
        None,
    )
    expected_track_1 = {
        "trackUri": "local:audio:oracle_goal_horn_1",
        "title": "Kernkraft 400",
        "artist": "Zombie Nation",
        "startTimeMs": 4500,
        "sourceType": "local",
        "localFileName": "Zombie Nation - Kernkraft 400.mp3",
        "mimeType": "audio/mpeg",
    }
    expected_track_2 = {
        "trackUri": "local:audio:oracle_hype_wav_2",
        "title": "Goal Horn Sundsvall",
        "artist": "Lokal ljudfil",
        "startTimeMs": 0,
        "sourceType": "local",
        "localFileName": "Goal_Horn_Sundsvall.wav",
        "mimeType": "audio/wav",
    }
    if not exported_pad or exported_pad["tracks"] != [expected_track_1]:
        raise AssertionError(f"Exported JSON missing local audio track metadata: {exported_pad!r}")

    before = res["beforeExport"]
    for label, actual in (
        ("importConfigJson return value", res["importedReturn"]),
        ("store after importConfigJson", res["afterImport"]),
        ("store after activateMatchProfile(localProfileId)", res["afterReactivateProfile"]),
    ):
        if actual != before:
            raise AssertionError(f"Local audio store round-trip mismatch in {label}")

    imported_pad = next((p for p in res["afterImport"]["soundPads"] if p["id"] == "pad-local-goal-horn"), None)
    if not imported_pad or imported_pad["tracks"] != [expected_track_1]:
        raise AssertionError(f"Imported pad-local-goal-horn mismatch: {imported_pad!r}")

    imported_hype_pad = next((p for p in res["afterImport"]["soundPads"] if p["id"] == "pad-hype-1"), None)
    if not imported_hype_pad or expected_track_2 not in imported_hype_pad["tracks"]:
        raise AssertionError(f"Imported pad-hype-1 missing local WAV track: {imported_hype_pad!r}")


def check_embedded_media_archive_dir_and_storage() -> None:
    """Oracle 19: Verify src/media existence, archive item filtering, registerEmbeddedMediaItems, syncEmbeddedMediaArchive, getLocalAudioPlaybackUrl, and getLocalAudioRecord."""
    media_dir = PROJECT_ROOT / "src" / "media"
    if not media_dir.is_dir():
        raise AssertionError(f"Expected embedded media archive directory at {media_dir}, but it does not exist")

    all_entries = sorted(
        p.relative_to(media_dir).as_posix()
        for p in media_dir.rglob("*")
        if p.is_file()
    )
    hidden_entries = [rel for rel in all_entries if any(part.startswith(".") for part in rel.split("/"))]
    visible_entries = [rel for rel in all_entries if rel not in hidden_entries]

    script = f"""
import {{
  buildEmbeddedMediaUri,
  inferAudioMimeType,
  isAcceptedAudioFileName,
  isLocalAudioUri,
  parseLocalAudioFilename,
}} from './src/utils/domain.ts';
import {{
  getLocalAudioPlaybackUrl,
  getLocalAudioRecord,
  registerEmbeddedMediaItems,
  syncEmbeddedMediaArchive,
}} from './src/services/localAudioStorage.ts';

const hiddenEntries = {json.dumps(hidden_entries)};
const visibleEntries = {json.dumps(visible_entries)};

const hiddenAcceptance = hiddenEntries.map((rel) => ({{
  rel,
  accepted: isAcceptedAudioFileName(rel.split('/').pop() ?? rel),
}}));

const visibleInspection = visibleEntries.map((rel) => {{
  const fileName = rel.split('/').pop() ?? rel;
  return {{
    rel,
    fileName,
    accepted: isAcceptedAudioFileName(fileName),
    mimeType: inferAudioMimeType(fileName),
    uri: buildEmbeddedMediaUri(rel),
  }};
}});

const uriMp3 = buildEmbeddedMediaUri('speaker/Kvinna - Intro.mp3');
const uriWav = buildEmbeddedMediaUri('horns/Arena - Goal Horn.wav');
const uriFallbackMime = buildEmbeddedMediaUri('chants/Arena Chant.ogg');

registerEmbeddedMediaItems([
  {{
    trackUri: uriMp3,
    fileName: 'Kvinna - Intro.mp3',
    relativePath: 'speaker/Kvinna - Intro.mp3',
    title: 'Intro',
    artist: 'Kvinna',
    mimeType: 'audio/mpeg',
    sizeBytes: 123456,
    streamUrl: '  /api/media-archive/file?path=speaker%2FKvinna%20-%20Intro.mp3  ',
  }},
  {{
    trackUri: uriWav,
    fileName: 'Arena - Goal Horn.wav',
    relativePath: 'horns/Arena - Goal Horn.wav',
    title: 'Goal Horn',
    artist: 'Arena',
    mimeType: 'audio/wav',
    sizeBytes: 65432,
    streamUrl: '/api/media-archive/file?path=horns%2FArena%20-%20Goal%20Horn.wav',
  }},
  {{
    trackUri: uriFallbackMime,
    fileName: 'Arena Chant.ogg',
    relativePath: 'chants/Arena Chant.ogg',
    title: 'Arena Chant',
    artist: 'Lokal ljudfil',
    mimeType: '',
    streamUrl: '/api/media-archive/file?path=chants%2FArena%20Chant.ogg',
  }},
  // Invalid entries that registerEmbeddedMediaItems must safely ignore
  {{
    trackUri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
    fileName: 'bad.mp3',
    relativePath: 'bad.mp3',
    title: 'Bad',
    artist: 'Bad',
    mimeType: 'audio/mpeg',
    streamUrl: '/api/media-archive/file?path=bad.mp3',
  }},
  {{
    trackUri: 'local:audio:media-empty-stream-12345',
    fileName: 'empty-stream.mp3',
    relativePath: 'empty-stream.mp3',
    title: 'Empty Stream',
    artist: 'Bad',
    mimeType: 'audio/mpeg',
    streamUrl: '   ',
  }},
]);

const urlMp3 = await getLocalAudioPlaybackUrl(uriMp3);
const urlMp3Trimmed = await getLocalAudioPlaybackUrl(`  ${{uriMp3}}  `);
const urlWav = await getLocalAudioPlaybackUrl(uriWav);
const urlFallbackMime = await getLocalAudioPlaybackUrl(uriFallbackMime);
const urlIgnoredEmptyStream = await getLocalAudioPlaybackUrl('local:audio:media-empty-stream-12345');
const urlInvalidSpotify = await getLocalAudioPlaybackUrl('spotify:track:4uLU6hMCjMI75M1A2tKUQC');
const urlUnknownLocal = await getLocalAudioPlaybackUrl('local:audio:media-not-registered-999');

const recMp3 = await getLocalAudioRecord(uriMp3);
const recWav = await getLocalAudioRecord(uriWav);
const recFallbackMime = await getLocalAudioRecord(uriFallbackMime);
const recInvalid = await getLocalAudioRecord('spotify:track:4uLU6hMCjMI75M1A2tKUQC');

// Verify syncEmbeddedMediaArchive() fetches /api/media-archive, normalizes items missing trackUri, and registers streamUrl
const originalFetch = globalThis.fetch;
let syncedItems = [];
let syncedUrl = null;
let syncedRecord = null;
try {{
  globalThis.fetch = async (url) => {{
    if (String(url) === '/api/media-archive') {{
      return new Response(
        JSON.stringify({{
          archiveDir: 'HockeyJockey/src/media',
          files: [
            {{
              fileName: 'Period_Break.flac',
              relativePath: 'breaks/Period_Break.flac',
              sizeBytes: 98765,
              streamUrl: '/api/media-archive/file?path=breaks%2FPeriod_Break.flac',
            }},
            {{
              fileName: '',
              streamUrl: '/api/media-archive/file?path=invalid',
            }},
          ],
        }}),
        {{ status: 200, headers: {{ 'Content-Type': 'application/json' }} }},
      );
    }}
    return new Response('Not Found', {{ status: 404 }});
  }};
  syncedItems = await syncEmbeddedMediaArchive();
  if (syncedItems.length === 1) {{
    syncedUrl = await getLocalAudioPlaybackUrl(syncedItems[0].trackUri);
    syncedRecord = await getLocalAudioRecord(syncedItems[0].trackUri);
  }}
}} finally {{
  globalThis.fetch = originalFetch;
}}

const toRecordInfo = (rec) => {{
  if (!rec) return null;
  const byteLen =
    rec.data instanceof ArrayBuffer
      ? rec.data.byteLength
      : ArrayBuffer.isView(rec.data)
        ? rec.data.byteLength
        : -1;
  return {{
    trackUri: rec.trackUri,
    fileName: rec.fileName,
    mimeType: rec.mimeType,
    sizeBytes: rec.sizeBytes,
    createdAt: rec.createdAt,
    dataByteLength: byteLen,
  }};
}};

const expectedSyncedUri = buildEmbeddedMediaUri('breaks/Period_Break.flac');
const expectedParsedFlac = parseLocalAudioFilename('Period_Break.flac');

console.log(JSON.stringify({{
  hiddenAcceptance,
  visibleInspection,
  uriMp3,
  uriWav,
  uriFallbackMime,
  uriMp3Valid: isLocalAudioUri(uriMp3),
  urlMp3,
  urlMp3Trimmed,
  urlWav,
  urlFallbackMime,
  urlIgnoredEmptyStream,
  urlInvalidSpotify,
  urlUnknownLocal,
  recMp3: toRecordInfo(recMp3),
  recWav: toRecordInfo(recWav),
  recFallbackMime: toRecordInfo(recFallbackMime),
  recInvalid,
  syncedItems,
  syncedUrl,
  syncedRecord: toRecordInfo(syncedRecord),
  expectedSyncedUri,
  expectedParsedFlac,
}}));
"""
    res = run_ts_script(script)

    for entry in res["hiddenAcceptance"]:
        if entry["accepted"] is not False:
            raise AssertionError(
                f"Hidden file in src/media must be rejected by isAcceptedAudioFileName: {entry!r}"
            )

    accepted_visible = [item for item in res["visibleInspection"] if item["accepted"]]
    if visible_entries and not accepted_visible:
        raise AssertionError(
            f"Expected accepted audio files in src/media when visible entries exist, got: {res['visibleInspection']!r}"
        )
    seen_real_uris = [item["uri"] for item in accepted_visible]
    if len(seen_real_uris) != len(set(seen_real_uris)):
        raise AssertionError(f"Duplicate embedded URIs generated for src/media files: {seen_real_uris!r}")

    if not res["uriMp3Valid"]:
        raise AssertionError(f"buildEmbeddedMediaUri produced invalid URI: {res['uriMp3']!r}")
    if res["urlMp3"] != "/api/media-archive/file?path=speaker%2FKvinna%20-%20Intro.mp3":
        raise AssertionError(f"Unexpected embedded playback URL for MP3: {res['urlMp3']!r}")
    if res["urlMp3Trimmed"] != res["urlMp3"]:
        raise AssertionError(f"Whitespace-trimmed embedded URI did not resolve identically: {res['urlMp3Trimmed']!r}")
    if res["urlWav"] != "/api/media-archive/file?path=horns%2FArena%20-%20Goal%20Horn.wav":
        raise AssertionError(f"Unexpected embedded playback URL for WAV: {res['urlWav']!r}")
    if res["urlFallbackMime"] != "/api/media-archive/file?path=chants%2FArena%20Chant.ogg":
        raise AssertionError(f"Unexpected embedded playback URL for OGG: {res['urlFallbackMime']!r}")

    for null_key in ("urlIgnoredEmptyStream", "urlInvalidSpotify", "urlUnknownLocal", "recInvalid"):
        if res[null_key] is not None:
            raise AssertionError(f"Expected null for {null_key}, got {res[null_key]!r}")

    if res["recMp3"] != {
        "trackUri": res["uriMp3"],
        "fileName": "Kvinna - Intro.mp3",
        "mimeType": "audio/mpeg",
        "sizeBytes": 123456,
        "createdAt": "embedded-media-archive",
        "dataByteLength": 0,
    }:
        raise AssertionError(f"Unexpected getLocalAudioRecord for embedded MP3: {res['recMp3']!r}")

    if res["recWav"] != {
        "trackUri": res["uriWav"],
        "fileName": "Arena - Goal Horn.wav",
        "mimeType": "audio/wav",
        "sizeBytes": 65432,
        "createdAt": "embedded-media-archive",
        "dataByteLength": 0,
    }:
        raise AssertionError(f"Unexpected getLocalAudioRecord for embedded WAV: {res['recWav']!r}")

    if res["recFallbackMime"] != {
        "trackUri": res["uriFallbackMime"],
        "fileName": "Arena Chant.ogg",
        "mimeType": "audio/ogg",
        "sizeBytes": 0,
        "createdAt": "embedded-media-archive",
        "dataByteLength": 0,
    }:
        raise AssertionError(f"Unexpected getLocalAudioRecord MIME/sizeBytes fallback: {res['recFallbackMime']!r}")

    if len(res["syncedItems"]) != 1:
        raise AssertionError(f"Expected 1 normalized item from syncEmbeddedMediaArchive(), got {res['syncedItems']!r}")
    synced_item = res["syncedItems"][0]
    if (
        synced_item["trackUri"] != res["expectedSyncedUri"]
        or synced_item["mimeType"] != "audio/flac"
        or synced_item["title"] != res["expectedParsedFlac"]["title"]
        or synced_item["artist"] != res["expectedParsedFlac"]["artist"]
        or synced_item["sizeBytes"] != 98765
    ):
        raise AssertionError(f"Unexpected normalized item from syncEmbeddedMediaArchive(): {synced_item!r}")
    if res["syncedUrl"] != "/api/media-archive/file?path=breaks%2FPeriod_Break.flac":
        raise AssertionError(f"syncEmbeddedMediaArchive() did not register streamUrl: {res['syncedUrl']!r}")
    if not res["syncedRecord"] or res["syncedRecord"]["createdAt"] != "embedded-media-archive":
        raise AssertionError(f"syncEmbeddedMediaArchive() did not register getLocalAudioRecord entry: {res['syncedRecord']!r}")


def check_store_embedded_media_archive_idempotency() -> None:
    """Oracle 20: Verify useAppStore.importEmbeddedMediaArchive auto-creation, idempotency, user deletion respect, and resetToDefaults isolation."""
    script = """
import { buildEmbeddedMediaUri } from './src/utils/domain.ts';
import {
  getLocalAudioPlaybackUrl,
  getLocalAudioRecord,
} from './src/services/localAudioStorage.ts';
import { useAppStore } from './src/store/useAppStore.ts';

useAppStore.getState().resetToDefaults();

try {
  const itemA = {
    trackUri: buildEmbeddedMediaUri('matchva-rd-speaker-kvinna-standard.mp3'),
    fileName: 'matchva-rd-speaker-kvinna-standard.mp3',
    relativePath: 'matchva-rd-speaker-kvinna-standard.mp3',
    title: 'Matchvärd Speaker Kvinna',
    artist: 'Lokal ljudfil',
    mimeType: 'audio/mpeg',
    sizeBytes: 812860,
    streamUrl: '/api/media-archive/file?path=matchva-rd-speaker-kvinna-standard.mp3',
  };

  const itemB = {
    trackUri: buildEmbeddedMediaUri('horns/Arena - Goal Horn.wav'),
    fileName: 'Arena - Goal Horn.wav',
    relativePath: 'horns/Arena - Goal Horn.wav',
    title: 'Goal Horn',
    artist: 'Arena',
    mimeType: 'audio/wav',
    sizeBytes: 120000,
    streamUrl: '/api/media-archive/file?path=horns%2FArena%20-%20Goal%20Horn.wav',
  };

  const itemC = {
    trackUri: buildEmbeddedMediaUri('periods/Period_Start.ogg'),
    fileName: 'Period_Start.ogg',
    relativePath: 'periods/Period_Start.ogg',
    title: 'Period Start',
    artist: 'Lokal ljudfil',
    mimeType: 'audio/ogg',
    sizeBytes: 45000,
    streamUrl: '/api/media-archive/file?path=periods%2FPeriod_Start.ogg',
  };

  const invalidItem = {
    trackUri: 'not-valid',
    fileName: 'broken.mp3',
    relativePath: 'broken.mp3',
    title: 'Broken',
    artist: 'Bad',
    mimeType: 'audio/mpeg',
    streamUrl: '/api/media-archive/file?path=broken.mp3',
  };

  const baselinePadCount = useAppStore.getState().soundPads.length;

  // 1. First import: creates SoundPads in 'media_archive' group & registers streamUrls
  const firstResult = useAppStore.getState().importEmbeddedMediaArchive([itemA, itemB, invalidItem]);
  const stateAfterFirst = useAppStore.getState();
  const padCountAfterFirst = stateAfterFirst.soundPads.length;
  const mediaGroupsAfterFirst = stateAfterFirst.settings.soundboardGroups.filter((g) => g.id === 'media_archive');
  const mediaPadsAfterFirst = stateAfterFirst.soundPads.filter((p) => p.category === 'media_archive');
  const autoUrisAfterFirst = [...stateAfterFirst.autoImportedMediaUris];
  const embeddedTracksAfterFirst = [...stateAfterFirst.embeddedMediaTracks];
  const playbackUrlA = await getLocalAudioPlaybackUrl(itemA.trackUri);
  const playbackUrlB = await getLocalAudioPlaybackUrl(itemB.trackUri);
  const recordA = await getLocalAudioRecord(itemA.trackUri);

  // 2. Repeated import with same archive: strictly idempotent (zero duplicates)
  const secondResult = useAppStore.getState().importEmbeddedMediaArchive([itemA, itemB]);
  const stateAfterSecond = useAppStore.getState();
  const padCountAfterSecond = stateAfterSecond.soundPads.length;
  const mediaGroupsAfterSecond = stateAfterSecond.settings.soundboardGroups.filter((g) => g.id === 'media_archive');
  const autoUrisAfterSecond = [...stateAfterSecond.autoImportedMediaUris];

  // 3. User deletes pad for itemA and customizes label on pad for itemB
  const padA = stateAfterSecond.soundPads.find((p) => p.tracks.some((t) => t.trackUri === itemA.trackUri));
  const padB = stateAfterSecond.soundPads.find((p) => p.tracks.some((t) => t.trackUri === itemB.trackUri));
  if (padA) {
    useAppStore.getState().deleteSoundPad(padA.id);
  }
  if (padB) {
    useAppStore.getState().updateSoundPad(padB.id, { label: 'Anpassad Arkivknapp' });
  }
  const padCountAfterUserDelete = useAppStore.getState().soundPads.length;

  // 4. Re-import same archive: deleted padA must NOT be re-imported and user label on padB must remain
  const thirdResult = useAppStore.getState().importEmbeddedMediaArchive([itemA, itemB]);
  const stateAfterThird = useAppStore.getState();
  const padCountAfterThird = stateAfterThird.soundPads.length;
  const padAAfterThird = stateAfterThird.soundPads.find((p) => p.tracks.some((t) => t.trackUri === itemA.trackUri)) ?? null;
  const padBAfterThird = stateAfterThird.soundPads.find((p) => p.tracks.some((t) => t.trackUri === itemB.trackUri)) ?? null;

  // 5. New file itemC added to archive: only itemC is newly imported; deleted itemA stays deleted
  const fourthResult = useAppStore.getState().importEmbeddedMediaArchive([itemA, itemB, itemC]);
  const stateAfterFourth = useAppStore.getState();
  const padCountAfterFourth = stateAfterFourth.soundPads.length;
  const padAAfterFourth = stateAfterFourth.soundPads.find((p) => p.tracks.some((t) => t.trackUri === itemA.trackUri)) ?? null;
  const padBAfterFourth = stateAfterFourth.soundPads.find((p) => p.tracks.some((t) => t.trackUri === itemB.trackUri)) ?? null;
  const padCAfterFourth = stateAfterFourth.soundPads.find((p) => p.tracks.some((t) => t.trackUri === itemC.trackUri)) ?? null;

  // 6. Reset to defaults clears autoImportedMediaUris & media_archive additions cleanly
  useAppStore.getState().resetToDefaults();
  const afterReset = useAppStore.getState();
  const resetCleanCheck = {
    padCount: afterReset.soundPads.length,
    autoImportedMediaUris: [...afterReset.autoImportedMediaUris],
    hasMediaGroup: afterReset.settings.soundboardGroups.some((g) => g.id === 'media_archive'),
    hasMediaPads: afterReset.soundPads.some((p) => p.category === 'media_archive'),
  };

  // 7. Pre-existing pad track matching enriches metadata without creating duplicate media_archive pad
  useAppStore.getState().addSoundPad({
    id: 'pad-existing-hype-media',
    label: 'Befintlig Pepp-knapp',
    category: 'hype',
    color: '#059669',
    tracks: [
      {
        trackUri: itemC.trackUri,
        title: 'Custom Existing Title',
        artist: 'Arena DJ',
        startTimeMs: 2500,
      },
    ],
  });
  const preExistingResult = useAppStore.getState().importEmbeddedMediaArchive([itemC]);
  const enrichedExistingPad = useAppStore.getState().soundPads.find((p) => p.id === 'pad-existing-hype-media') ?? null;
  const mediaPadsAfterPreExisting = useAppStore.getState().soundPads.filter((p) => p.category === 'media_archive');

  // 8. Empty archive call clears embeddedMediaTracks safely
  const emptyResult = useAppStore.getState().importEmbeddedMediaArchive([]);
  const embeddedAfterEmpty = [...useAppStore.getState().embeddedMediaTracks];

  console.log(JSON.stringify({
    itemA,
    itemB,
    itemC,
    baselinePadCount,
    firstResult,
    padCountAfterFirst,
    mediaGroupsAfterFirst,
    mediaPadsAfterFirst,
    autoUrisAfterFirst,
    embeddedTracksAfterFirst,
    playbackUrlA,
    playbackUrlB,
    recordACreatedAt: recordA?.createdAt ?? null,
    secondResult,
    padCountAfterSecond,
    mediaGroupsAfterSecond,
    autoUrisAfterSecond,
    padCountAfterUserDelete,
    thirdResult,
    padCountAfterThird,
    padAAfterThird,
    padBAfterThird,
    fourthResult,
    padCountAfterFourth,
    padAAfterFourth,
    padBAfterFourth,
    padCAfterFourth,
    resetCleanCheck,
    preExistingResult,
    enrichedExistingPad,
    mediaPadsAfterPreExisting,
    emptyResult,
    embeddedAfterEmpty,
  }));
} finally {
  useAppStore.getState().resetToDefaults();
  useAppStore.getState().importEmbeddedMediaArchive([]);
}
"""
    res = run_ts_script(script)

    item_a = res["itemA"]
    item_b = res["itemB"]
    item_c = res["itemC"]
    base_count = res["baselinePadCount"]

    if res["firstResult"] != {"totalArchiveCount": 2, "newlyAddedCount": 2}:
        raise AssertionError(f"Unexpected first importEmbeddedMediaArchive result: {res['firstResult']!r}")
    if res["padCountAfterFirst"] != base_count + 2:
        raise AssertionError(
            f"Expected {base_count + 2} pads after first import, got {res['padCountAfterFirst']}"
        )
    if res["mediaGroupsAfterFirst"] != [
        {"id": "media_archive", "label": "Inbäddat Mediaarkiv", "isBuiltin": False}
    ]:
        raise AssertionError(f"Unexpected 'media_archive' group after first import: {res['mediaGroupsAfterFirst']!r}")
    if len(res["mediaPadsAfterFirst"]) != 2:
        raise AssertionError(f"Expected 2 pads in 'media_archive' category, got {res['mediaPadsAfterFirst']!r}")

    for pad in res["mediaPadsAfterFirst"]:
        if not pad["id"].startswith("pad-media-") or pad["category"] != "media_archive":
            raise AssertionError(f"Invalid auto-created media pad shape: {pad!r}")
        if len(pad["tracks"]) != 1 or pad["tracks"][0].get("sourceType") != "local":
            raise AssertionError(f"Auto-created media pad missing local track metadata: {pad!r}")

    if res["autoUrisAfterFirst"] != [item_a["trackUri"], item_b["trackUri"]]:
        raise AssertionError(f"Unexpected autoImportedMediaUris after first import: {res['autoUrisAfterFirst']!r}")
    if len(res["embeddedTracksAfterFirst"]) != 2:
        raise AssertionError(f"Expected 2 embeddedMediaTracks, got {res['embeddedTracksAfterFirst']!r}")
    if res["playbackUrlA"] != item_a["streamUrl"] or res["playbackUrlB"] != item_b["streamUrl"]:
        raise AssertionError(
            f"importEmbeddedMediaArchive did not register streamUrls: A={res['playbackUrlA']!r}, B={res['playbackUrlB']!r}"
        )
    if res["recordACreatedAt"] != "embedded-media-archive":
        raise AssertionError(f"Expected 'embedded-media-archive' record after import, got {res['recordACreatedAt']!r}")

    if res["secondResult"] != {"totalArchiveCount": 2, "newlyAddedCount": 0}:
        raise AssertionError(f"Second importEmbeddedMediaArchive should add 0 new pads: {res['secondResult']!r}")
    if res["padCountAfterSecond"] != base_count + 2:
        raise AssertionError(f"Second import duplicated pads: count={res['padCountAfterSecond']}")
    if len(res["mediaGroupsAfterSecond"]) != 1:
        raise AssertionError(f"Second import duplicated 'media_archive' group: {res['mediaGroupsAfterSecond']!r}")
    if res["autoUrisAfterSecond"] != [item_a["trackUri"], item_b["trackUri"]]:
        raise AssertionError(f"Second import mutated autoImportedMediaUris: {res['autoUrisAfterSecond']!r}")

    if res["padCountAfterUserDelete"] != base_count + 1:
        raise AssertionError(f"deleteSoundPad did not remove padA: count={res['padCountAfterUserDelete']}")
    if res["thirdResult"] != {"totalArchiveCount": 2, "newlyAddedCount": 0}:
        raise AssertionError(f"Third import after user deletion should add 0 pads: {res['thirdResult']!r}")
    if res["padCountAfterThird"] != base_count + 1 or res["padAAfterThird"] is not None:
        raise AssertionError(f"Deleted media padA was re-imported on third load: padA={res['padAAfterThird']!r}")
    if not res["padBAfterThird"] or res["padBAfterThird"]["label"] != "Anpassad Arkivknapp":
        raise AssertionError(f"User edit on padB was overwritten on third load: {res['padBAfterThird']!r}")

    if res["fourthResult"] != {"totalArchiveCount": 3, "newlyAddedCount": 1}:
        raise AssertionError(f"Fourth import with new itemC expected newlyAddedCount=1, got {res['fourthResult']!r}")
    if res["padCountAfterFourth"] != base_count + 2 or res["padAAfterFourth"] is not None:
        raise AssertionError(f"Fourth import count mismatch or re-imported deleted padA: count={res['padCountAfterFourth']}")
    if not res["padBAfterFourth"] or res["padBAfterFourth"]["label"] != "Anpassad Arkivknapp":
        raise AssertionError(f"Fourth import overwrote user label on padB: {res['padBAfterFourth']!r}")
    if (
        not res["padCAfterFourth"]
        or res["padCAfterFourth"]["category"] != "media_archive"
        or res["padCAfterFourth"]["tracks"][0]["trackUri"] != item_c["trackUri"]
    ):
        raise AssertionError(f"Fourth import did not create pad for new itemC: {res['padCAfterFourth']!r}")

    reset_chk = res["resetCleanCheck"]
    if (
        reset_chk["padCount"] != base_count
        or reset_chk["autoImportedMediaUris"] != []
        or reset_chk["hasMediaGroup"] is not False
        or reset_chk["hasMediaPads"] is not False
    ):
        raise AssertionError(f"resetToDefaults() did not cleanly isolate embedded media archive state: {reset_chk!r}")

    if res["preExistingResult"] != {"totalArchiveCount": 1, "newlyAddedCount": 0}:
        raise AssertionError(f"Expected newlyAddedCount=0 for pre-existing pad track, got {res['preExistingResult']!r}")
    if res["mediaPadsAfterPreExisting"]:
        raise AssertionError(f"Should not create duplicate media_archive pad when track already exists on pad: {res['mediaPadsAfterPreExisting']!r}")
    enriched_track = (res["enrichedExistingPad"] or {}).get("tracks", [{}])[0]
    if (
        enriched_track.get("sourceType") != "local"
        or enriched_track.get("localFileName") != "Period_Start.ogg"
        or enriched_track.get("mimeType") != "audio/ogg"
    ):
        raise AssertionError(f"Pre-existing pad track was not enriched with local metadata: {enriched_track!r}")

    if res["emptyResult"] != {"totalArchiveCount": 0, "newlyAddedCount": 0} or res["embeddedAfterEmpty"] != []:
        raise AssertionError(f"Empty importEmbeddedMediaArchive([]) behavior mismatch: {res['emptyResult']!r}, {res['embeddedAfterEmpty']!r}")


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
        ("10. Store awayGoalSilence default, MatchProfile switching & JSON round-trip", check_store_away_goal_silence),
        ("11. Spotify track metadata (fetchSpotifyTrackMetadata & example link)", check_spotify_track_metadata),
        ("12. AudioController.playAt() self-healing ensureReady() & failing adapter fallback", check_audio_controller_self_healing_ensure_ready),
        ("13. SpotifyPlayerService.discoverConnectDevice() & 'connect' transport resilience", check_spotify_connect_discovery_and_transport),
        ("14. Store custom SoundboardGroup CRUD, ordering & safe pad fallback migration", check_store_custom_soundboard_groups_crud_and_migration),
        ("15. Store MatchProfile switching & JSON round-trip with custom soundboardGroups", check_store_custom_groups_profiles_and_json_roundtrip),
        ("16. localAudioStorage CRUD, MIME inference & playback URL caching", check_local_audio_storage),
        ("17. AudioController.playAt() with local audio, volume ramps & Spotify setVolume isolation", check_audio_controller_local_audio_and_ramps),
        ("18. Store full JSON export/import round-trip with local audio tracks", check_store_local_audio_json_roundtrip),
        ("19. Embedded media archive dir src/media, filtering & localAudioStorage streamUrl resolution", check_embedded_media_archive_dir_and_storage),
        ("20. Store importEmbeddedMediaArchive auto-pads in 'media_archive', idempotency & deletion respect", check_store_embedded_media_archive_idempotency),
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
