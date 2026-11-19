#!/usr/bin/env python3
"""Stage 4 Objective Functional Oracle for HockeyJockey.

Verifies all 5 requirements in section 4.3 of blueprints/03_oracle_and_gate_init.md:
1. Production build (`npm run build`) and non-empty artifacts in `dist/`.
2. RFC 7636 Appendix B PKCE SHA-256 test vector via `generatePkceChallenge`.
3. All 13 penalty definitions in `src/data/penalties.ts` and SVG rendering in `src/components/RefereeIcons.tsx`.
4. JSON export/import round-trip (`exportMatchConfig` -> `importMatchConfig`) and headless `AudioController` execution.
5. Git repository state, active `main` branch, and `origin` remote pointing to `5w00t3dL10n/HockeyJockey`.

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
import { DEFAULT_SETTINGS, DEFAULT_SOUND_PADS, DEFAULT_TEAMS } from './src/data/defaults.ts';
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
    scriptTemplates: {
      ...DEFAULT_SETTINGS.scriptTemplates,
      goal: 'MÅL! {team} #{scorerNumber} {scorerName}.',
    },
  },
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


def main() -> int:
    checks = [
        ("1. Production build & dist/ artifacts", check_production_build),
        ("2. RFC 7636 PKCE SHA-256 vector", check_pkce_rfc7636),
        ("3. 13 Penalty definitions & RefereeIcons SVG", check_penalties_and_referee_icons),
        ("4. JSON export/import round-trip & AudioController", check_json_roundtrip_and_audio_controller),
        ("5. Git repository & origin remote", check_git_and_github_remote),
    ]

    for label, fn in checks:
        print(f"[ORACLE] Running: {label}...", flush=True)
        try:
            fn()
        except Exception as exc:
            print(f"[ORACLE FAIL] {label}: {exc}", file=sys.stderr, flush=True)
            return 1
        print(f"[ORACLE PASS] {label}", flush=True)

    print("[ORACLE] All 5 objective functional oracle checks passed.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
