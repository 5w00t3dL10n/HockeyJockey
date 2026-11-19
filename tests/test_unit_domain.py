"""Stage 2 Unit Tests for HockeyJockey domain logic (src/utils/domain.ts).

Executed automatically by invoke-v2-gate via:
    python3 -m unittest discover -s tests -p "*test*.py"
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import unittest
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def resolve_tsx_command() -> list[str]:
    """Return command prefix to execute TypeScript via local tsx or npx."""
    local_tsx = PROJECT_ROOT / "node_modules" / ".bin" / "tsx"
    if local_tsx.is_file() and os.access(local_tsx, os.X_OK):
        return [str(local_tsx)]
    return ["npx", "--no-install", "tsx"]


def run_ts_script(ts_source: str) -> Any:
    """Execute a TypeScript ES module snippet via tsx and parse its JSON stdout."""
    cmd = [*resolve_tsx_command(), "--input-type=module", "-"]
    proc = subprocess.run(
        cmd,
        input=ts_source,
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise AssertionError(
            f"TypeScript execution failed (exit={proc.returncode}):\n"
            f"STDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
        )
    stdout = proc.stdout.strip()
    if not stdout:
        raise AssertionError("TypeScript execution produced empty stdout.")
    last_line = stdout.splitlines()[-1]
    return json.loads(last_line)


class TestDomainLogic(unittest.TestCase):
    """Unit tests executing real TypeScript exports from src/utils/domain.ts."""

    def test_01_time_parsing_and_formatting(self) -> None:
        """Verify parseTimeMmSsToMs, formatMsToMmSs, and negative/invalid guards."""
        script = """
import { formatMsToMmSs, parseTimeMmSsToMs } from './src/utils/domain.ts';

function expectThrows(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const result = {
  parse0045: parseTimeMmSsToMs('00:45'),
  parse0215: parseTimeMmSsToMs('02:15'),
  format135000: formatMsToMmSs(135000),
  format45000: formatMsToMmSs(45000),
  formatNegative: formatMsToMmSs(-5000),
  formatZero: formatMsToMmSs(0),
  formatNaN: formatMsToMmSs(Number.NaN),
  formatInfinity: formatMsToMmSs(Number.POSITIVE_INFINITY),
  parseNegativeNonStrict: parseTimeMmSsToMs('-01:00'),
  parseInvalidSec60NonStrict: parseTimeMmSsToMs('01:60'),
  parseInvalidSec99NonStrict: parseTimeMmSsToMs('02:99'),
  parseGarbageNonStrict: parseTimeMmSsToMs('invalid'),
  strictThrowsNegative: expectThrows(() => parseTimeMmSsToMs('-01:00', { strict: true })),
  strictThrowsSec60: expectThrows(() => parseTimeMmSsToMs('01:60', { strict: true })),
  strictThrowsSec99: expectThrows(() => parseTimeMmSsToMs('02:99', { strict: true })),
  strictThrowsGarbage: expectThrows(() => parseTimeMmSsToMs('invalid', { strict: true })),
};
console.log(JSON.stringify(result));
"""
        res = run_ts_script(script)
        self.assertEqual(res["parse0045"], 45000)
        self.assertEqual(res["parse0215"], 135000)
        self.assertEqual(res["format135000"], "02:15")
        self.assertEqual(res["format45000"], "00:45")
        self.assertEqual(res["formatNegative"], "00:00")
        self.assertEqual(res["formatZero"], "00:00")
        self.assertEqual(res["formatNaN"], "00:00")
        self.assertEqual(res["formatInfinity"], "00:00")
        self.assertEqual(res["parseNegativeNonStrict"], 0)
        self.assertEqual(res["parseInvalidSec60NonStrict"], 0)
        self.assertEqual(res["parseInvalidSec99NonStrict"], 0)
        self.assertEqual(res["parseGarbageNonStrict"], 0)
        self.assertTrue(res["strictThrowsNegative"])
        self.assertTrue(res["strictThrowsSec60"])
        self.assertTrue(res["strictThrowsSec99"])
        self.assertTrue(res["strictThrowsGarbage"])

    def test_02_parse_spotify_uri(self) -> None:
        """Verify parseSpotifyUri with standard, intl-sv URLs, and invalid inputs."""
        script = """
import { parseSpotifyUri, tryParseSpotifyUri } from './src/utils/domain.ts';

let invalidThrew = false;
try {
  parseSpotifyUri('https://example.com/track/notvalid');
} catch {
  invalidThrew = true;
}

const result = {
  standardUrl: parseSpotifyUri('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123'),
  intlSvUrl: parseSpotifyUri('https://open.spotify.com/intl-sv/track/4uLU6hMCjMI75M1A2tKUQC?si=xyz999'),
  directUri: parseSpotifyUri('spotify:track:4uLU6hMCjMI75M1A2tKUQC'),
  invalidThrew,
  emptyResult: tryParseSpotifyUri('   '),
};
console.log(JSON.stringify(result));
"""
        res = run_ts_script(script)
        expected_uri = "spotify:track:4uLU6hMCjMI75M1A2tKUQC"
        self.assertEqual(res["standardUrl"], expected_uri)
        self.assertEqual(res["intlSvUrl"], expected_uri)
        self.assertEqual(res["directUri"], expected_uri)
        self.assertTrue(res["invalidThrew"])
        self.assertFalse(res["emptyResult"]["ok"])

    def test_03_parse_roster_text_preserves_leading_zeros(self) -> None:
        """Verify parseRosterText parses jersey numbers and preserves leading zeros."""
        script = """
import { parseRosterText } from './src/utils/domain.ts';

const roster = parseRosterText('22 Rasmus Karlsson\\n00 Målvakt\\n#14 - Erik Svensson');
const leadingZeroSingle = parseRosterText('07 Anna Berg\\n00 Oscar Holm');

console.log(JSON.stringify({
  roster,
  keys: Object.keys(roster),
  leadingZeroSingle,
}));
"""
        res = run_ts_script(script)
        self.assertEqual(
            res["roster"],
            {
                "22": "Rasmus Karlsson",
                "00": "Målvakt",
                "14": "Erik Svensson",
            },
        )
        self.assertIn("00", res["keys"])
        self.assertIn("22", res["keys"])
        self.assertIn("14", res["keys"])
        self.assertEqual(res["leadingZeroSingle"]["07"], "Anna Berg")
        self.assertEqual(res["leadingZeroSingle"]["00"], "Oscar Holm")

    def test_04_select_next_track_cyclic_rotation(self) -> None:
        """Verify selectNextTrack cycles 0 -> 1 -> 2 -> 0 over a 3-track pool."""
        script = """
import { selectNextTrack } from './src/utils/domain.ts';

const pad = {
  id: 'test-pad',
  label: 'Test Pool',
  category: 'faceoff_off',
  color: '#0284c7',
  tracks: [
    { trackUri: 'spotify:track:1111111111111111111111', title: 'Track 0', artist: 'A', startTimeMs: 0 },
    { trackUri: 'spotify:track:2222222222222222222222', title: 'Track 1', artist: 'B', startTimeMs: 1000 },
    { trackUri: 'spotify:track:3333333333333333333333', title: 'Track 2', artist: 'C', startTimeMs: 2000 },
  ],
};

const emptyPad = { ...pad, tracks: [] };

const step0 = selectNextTrack(pad);
pad.lastPlayedIndex = step0.nextIndex;
const step1 = selectNextTrack(pad);
pad.lastPlayedIndex = step1.nextIndex;
const step2 = selectNextTrack(pad);
pad.lastPlayedIndex = step2.nextIndex;
const step3 = selectNextTrack(pad);

const emptyStep = selectNextTrack(emptyPad);

console.log(JSON.stringify({
  indices: [step0.nextIndex, step1.nextIndex, step2.nextIndex, step3.nextIndex],
  titles: [step0.track?.title, step1.track?.title, step2.track?.title, step3.track?.title],
  emptyStep,
}));
"""
        res = run_ts_script(script)
        self.assertEqual(res["indices"], [0, 1, 2, 0])
        self.assertEqual(res["titles"], ["Track 0", "Track 1", "Track 2", "Track 0"])
        self.assertEqual(res["emptyStep"], {"track": None, "nextIndex": -1})

    def test_05_calculate_volume_steps(self) -> None:
        """Verify duckVolume (8 steps), fadeOutAndPause (12 steps), and zero-division protection."""
        script = """
import { calculateVolumeSteps } from './src/utils/domain.ts';

const duckSteps = calculateVolumeSteps(1.0, 0.2, 400, 50);
const fadeSteps = calculateVolumeSteps(1.0, 0.0, 600, 50);
const zeroDuration = calculateVolumeSteps(1.0, 0.2, 0, 50);
const zeroInterval = calculateVolumeSteps(1.0, 0.2, 400, 0);
const bothZero = calculateVolumeSteps(1.0, 0.0, 0, 0);
const negativeDuration = calculateVolumeSteps(1.0, 0.4, -200, 50);

console.log(JSON.stringify({
  duckSteps,
  fadeSteps,
  zeroDuration,
  zeroInterval,
  bothZero,
  negativeDuration,
}));
"""
        res = run_ts_script(script)

        duck_steps = res["duckSteps"]
        self.assertEqual(len(duck_steps), 8)
        self.assertAlmostEqual(duck_steps[-1], 0.2, places=6)
        for idx, val in enumerate(duck_steps):
            self.assertIsInstance(val, (int, float))
            self.assertTrue(math.isfinite(val))
            self.assertGreaterEqual(val, 0.2)
            self.assertLessEqual(val, 1.0)
            if idx > 0:
                self.assertLess(val, duck_steps[idx - 1])

        fade_steps = res["fadeSteps"]
        self.assertEqual(len(fade_steps), 12)
        self.assertEqual(fade_steps[-1], 0.0)
        for idx, val in enumerate(fade_steps):
            self.assertIsInstance(val, (int, float))
            self.assertTrue(math.isfinite(val))
            self.assertGreaterEqual(val, 0.0)
            self.assertLessEqual(val, 1.0)
            if idx > 0:
                self.assertLess(val, fade_steps[idx - 1])

        for guard_key in ("zeroDuration", "zeroInterval", "bothZero", "negativeDuration"):
            steps = res[guard_key]
            self.assertIsInstance(steps, list)
            self.assertGreaterEqual(len(steps), 1)
            for val in steps:
                self.assertIsInstance(val, (int, float))
                self.assertTrue(math.isfinite(val))

        self.assertEqual(res["zeroDuration"][-1], 0.2)
        self.assertEqual(res["bothZero"][-1], 0.0)

    def test_06_generate_penalty_and_goal_scripts(self) -> None:
        """Verify Swedish script generation for penalties (player, unknown, team) and goals (0, 1, 2 assists)."""
        script = """
import { DEFAULT_SETTINGS } from './src/data/defaults.ts';
import { generateGoalScript, generatePenaltyScript } from './src/utils/domain.ts';

const penaltyPlayer = generatePenaltyScript(DEFAULT_SETTINGS, {
  teamName: 'Sundsvall Hockey',
  penaltyLabel: 'Tripping',
  duration: '2 minuter',
  playerNumber: '22',
  playerName: 'Rasmus Karlsson',
});

const penaltyNumberUnknownName = generatePenaltyScript(DEFAULT_SETTINGS, {
  teamName: 'Sundsvall Hockey',
  penaltyLabel: 'Hooking',
  duration: '2 minuter',
  playerNumber: '99',
  playerName: '',
});

const penaltyUnknownNumber = generatePenaltyScript(DEFAULT_SETTINGS, {
  teamName: 'Sundsvall Hockey',
  penaltyLabel: 'Slashing',
  duration: '2 minuter',
  playerNumber: '',
  playerName: '',
});

const penaltyTeam = generatePenaltyScript(DEFAULT_SETTINGS, {
  teamName: 'Timrå IK',
  penaltyLabel: 'För många spelare',
  duration: '2 minuter',
  isTeamPenalty: true,
});

const goalNoAssist = generateGoalScript(DEFAULT_SETTINGS, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '14',
  scorerName: 'Erik Svensson',
  assists: [],
});

const goalNoAssistUnknownName = generateGoalScript(DEFAULT_SETTINGS, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '00',
  scorerName: '',
  assists: [],
});

const goalOneAssist = generateGoalScript(DEFAULT_SETTINGS, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '14',
  scorerName: 'Erik Svensson',
  assists: [{ number: '22', name: 'Rasmus Karlsson' }],
});

const goalTwoAssists = generateGoalScript(DEFAULT_SETTINGS, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '14',
  scorerName: 'Erik Svensson',
  assists: [
    { number: '22', name: 'Rasmus Karlsson' },
    { number: '10', name: 'Albin Söderberg' },
  ],
});

console.log(JSON.stringify({
  penaltyPlayer,
  penaltyNumberUnknownName,
  penaltyUnknownNumber,
  penaltyTeam,
  goalNoAssist,
  goalNoAssistUnknownName,
  goalOneAssist,
  goalTwoAssists,
}));
"""
        res = run_ts_script(script)

        self.assertEqual(
            res["penaltyPlayer"],
            "Sundsvall Hockey drar på sig en utvisning genom nummer 22, Rasmus Karlsson, 2 minuter för Tripping.",
        )
        self.assertEqual(
            res["penaltyNumberUnknownName"],
            "Sundsvall Hockey drar på sig en utvisning genom nummer 99, 2 minuter för Hooking.",
        )
        self.assertEqual(
            res["penaltyUnknownNumber"],
            "Lagstraff för Sundsvall Hockey, 2 minuter för Slashing.",
        )
        self.assertEqual(
            res["penaltyTeam"],
            "Lagstraff för Timrå IK, 2 minuter för För många spelare.",
        )
        self.assertEqual(
            res["goalNoAssist"],
            "Mål för Sundsvall Hockey! Målskytt nummer 14, Erik Svensson.",
        )
        self.assertEqual(
            res["goalNoAssistUnknownName"],
            "Mål för Sundsvall Hockey! Målskytt nummer 00.",
        )
        self.assertEqual(
            res["goalOneAssist"],
            "Mål för Sundsvall Hockey! Målskytt nummer 14, Erik Svensson. Framspelad av nummer 22 Rasmus Karlsson.",
        )
        self.assertEqual(
            res["goalTwoAssists"],
            "Mål för Sundsvall Hockey! Målskytt nummer 14, Erik Svensson. Framspelad av nummer 22 Rasmus Karlsson och nummer 10 Albin Söderberg.",
        )

        for key, text in res.items():
            self.assertNotIn("{", text, f"Unreplaced placeholder in {key}: {text}")
            self.assertNotIn("}", text, f"Unreplaced placeholder in {key}: {text}")

    def test_07_normalize_and_format_hotkeys(self) -> None:
        """Verify normalizeHotkeyString and formatHotkeyFromEvent including modifiers and edge cases."""
        script = """
import { formatHotkeyFromEvent, normalizeHotkeyString } from './src/utils/domain.ts';

const normalized = {
  spaceLower: normalizeHotkeyString('space'),
  spaceChar: normalizeHotkeyString(' '),
  shiftSpace: normalizeHotkeyString('shift+space'),
  keyD: normalizeHotkeyString('KeyD'),
  lowerD: normalizeHotkeyString('d'),
  f1: normalizeHotkeyString('f1'),
  digit1: normalizeHotkeyString('Digit1'),
  shiftDigit1: normalizeHotkeyString('shift+Digit1'),
  reorderedMods: normalizeHotkeyString('shift+ctrl+KeyD'),
  modShiftOnly: normalizeHotkeyString('Shift'),
  modCtrlOnly: normalizeHotkeyString('Ctrl'),
  modControlOnly: normalizeHotkeyString('Control'),
  modAltOnly: normalizeHotkeyString('Alt'),
  modMetaOnly: normalizeHotkeyString('Meta'),
  modShiftLeftOnly: normalizeHotkeyString('ShiftLeft'),
  empty: normalizeHotkeyString(''),
  whitespace: normalizeHotkeyString('   '),
};

const formatted = {
  evSpace: formatHotkeyFromEvent({ key: ' ', code: 'Space' }),
  evShiftSpace: formatHotkeyFromEvent({ key: ' ', code: 'Space', shiftKey: true }),
  evKeyDLower: formatHotkeyFromEvent({ key: 'd', code: 'KeyD' }),
  evKeyDUpper: formatHotkeyFromEvent({ key: 'D', code: 'KeyD' }),
  evKeyDNoCode: formatHotkeyFromEvent({ key: 'd' }),
  evF1: formatHotkeyFromEvent({ key: 'F1', code: 'F1' }),
  evDigit1ShiftBang: formatHotkeyFromEvent({ key: '!', code: 'Digit1', shiftKey: true }),
  evDigit1ShiftOne: formatHotkeyFromEvent({ key: '1', code: 'Digit1', shiftKey: true }),
  evStandaloneShift: formatHotkeyFromEvent({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }),
  evStandaloneCtrl: formatHotkeyFromEvent({ key: 'Control', code: 'ControlLeft', ctrlKey: true }),
  evStandaloneAlt: formatHotkeyFromEvent({ key: 'Alt', code: 'AltLeft', altKey: true }),
  evStandaloneMeta: formatHotkeyFromEvent({ key: 'Meta', code: 'MetaLeft', metaKey: true }),
};

console.log(JSON.stringify({ normalized, formatted }));
"""
        res = run_ts_script(script)
        n = res["normalized"]
        self.assertEqual(n["spaceLower"], "Space")
        self.assertEqual(n["spaceChar"], "Space")
        self.assertEqual(n["shiftSpace"], "Shift+Space")
        self.assertEqual(n["keyD"], "D")
        self.assertEqual(n["lowerD"], "D")
        self.assertEqual(n["f1"], "F1")
        self.assertEqual(n["digit1"], "1")
        self.assertEqual(n["shiftDigit1"], "Shift+1")
        self.assertEqual(n["reorderedMods"], "Ctrl+Shift+D")

        for mod_key in (
            "modShiftOnly",
            "modCtrlOnly",
            "modControlOnly",
            "modAltOnly",
            "modMetaOnly",
            "modShiftLeftOnly",
            "empty",
            "whitespace",
        ):
            self.assertEqual(n[mod_key], "", f"Expected '' for {mod_key}, got {n[mod_key]!r}")

        f = res["formatted"]
        self.assertEqual(f["evSpace"], "Space")
        self.assertEqual(f["evShiftSpace"], "Shift+Space")
        self.assertEqual(f["evKeyDLower"], "D")
        self.assertEqual(f["evKeyDUpper"], "D")
        self.assertEqual(f["evKeyDNoCode"], "D")
        self.assertEqual(f["evF1"], "F1")
        self.assertEqual(f["evDigit1ShiftBang"], "Shift+1")
        self.assertEqual(f["evDigit1ShiftOne"], "Shift+1")

        for standalone_key in (
            "evStandaloneShift",
            "evStandaloneCtrl",
            "evStandaloneAlt",
            "evStandaloneMeta",
        ):
            self.assertEqual(
                f[standalone_key],
                "",
                f"Expected '' for {standalone_key}, got {f[standalone_key]!r}",
            )

    def test_08_assign_hotkey_and_resolve_hotkey_match(self) -> None:
        """Verify assignHotkey (actions, pads, conflict resolution, clearing) and resolveHotkeyMatch."""
        script = """
import { DEFAULT_KEY_BINDINGS } from './src/data/defaults.ts';
import { assignHotkey, resolveHotkeyMatch } from './src/utils/domain.ts';

const initial = {
  actions: { ...DEFAULT_KEY_BINDINGS.actions },
  pads: { ...DEFAULT_KEY_BINDINGS.pads },
};

// 1. Assign non-conflicting key to MatchActionId
const step1 = assignHotkey(initial, { type: 'action', id: 'toggleDuck' }, 'KeyM');
const matchM = resolveHotkeyMatch(step1.keyBindings, 'm');
const matchOldD = resolveHotkeyMatch(step1.keyBindings, 'd');

// 2. Assign non-conflicting key to SoundPad
const step2 = assignHotkey(step1.keyBindings, { type: 'pad', id: 'pad-organ-1' }, 'Digit1');
const match1 = resolveHotkeyMatch(step2.keyBindings, '1');

// 3. Conflict resolution: Pad steals key from Action ('goalHome' currently has 'F1')
const step3 = assignHotkey(step2.keyBindings, { type: 'pad', id: 'pad-hype-1' }, 'f1');
const matchF1AfterPadSteal = resolveHotkeyMatch(step3.keyBindings, 'F1');

// 4. Conflict resolution: Action steals key from Pad ('pad-organ-1' currently has '1')
const step4 = assignHotkey(step3.keyBindings, { type: 'action', id: 'goalHome' }, 'Digit1');
const match1AfterActionSteal = resolveHotkeyMatch(step4.keyBindings, '1');

// 5. Conflict resolution: Pad steals key from another Pad ('pad-hype-1' currently has 'F1')
const step5 = assignHotkey(step4.keyBindings, { type: 'pad', id: 'pad-misc-timeout' }, 'F1');
const matchF1AfterPadToPad = resolveHotkeyMatch(step5.keyBindings, 'F1');

// 6. Conflict resolution: Action steals key from another Action ('fadeOut' currently has 'Space')
const step6 = assignHotkey(step5.keyBindings, { type: 'action', id: 'hardStop' }, 'space');
const matchSpaceAfterActionToAction = resolveHotkeyMatch(step6.keyBindings, 'Space');

// 7. Re-assigning same key to same target produces null replacedTarget
const step7Same = assignHotkey(step6.keyBindings, { type: 'action', id: 'hardStop' }, 'Space');

// 8. Clearing action and pad bindings with ''
const step8ClearAction = assignHotkey(step7Same.keyBindings, { type: 'action', id: 'hardStop' }, '');
const matchSpaceAfterClear = resolveHotkeyMatch(step8ClearAction.keyBindings, 'Space');

const step9ClearPad = assignHotkey(step8ClearAction.keyBindings, { type: 'pad', id: 'pad-misc-timeout' }, '');
const matchF1AfterClear = resolveHotkeyMatch(step9ClearPad.keyBindings, 'F1');

console.log(JSON.stringify({
  initialToggleDuckPreserved: initial.actions.toggleDuck,
  step1Replaced: step1.replacedTarget,
  step1ToggleDuck: step1.keyBindings.actions.toggleDuck,
  matchM,
  matchOldD,
  step2Replaced: step2.replacedTarget,
  step2PadOrgan: step2.keyBindings.pads['pad-organ-1'],
  match1,
  step3Replaced: step3.replacedTarget,
  step3GoalHome: step3.keyBindings.actions.goalHome,
  step3PadHype: step3.keyBindings.pads['pad-hype-1'],
  matchF1AfterPadSteal,
  step4Replaced: step4.replacedTarget,
  step4HasPadOrgan: 'pad-organ-1' in step4.keyBindings.pads,
  step4GoalHome: step4.keyBindings.actions.goalHome,
  match1AfterActionSteal,
  step5Replaced: step5.replacedTarget,
  step5HasPadHype: 'pad-hype-1' in step5.keyBindings.pads,
  step5PadMisc: step5.keyBindings.pads['pad-misc-timeout'],
  matchF1AfterPadToPad,
  step6Replaced: step6.replacedTarget,
  step6FadeOut: step6.keyBindings.actions.fadeOut,
  step6HardStop: step6.keyBindings.actions.hardStop,
  matchSpaceAfterActionToAction,
  step7Replaced: step7Same.replacedTarget,
  step8Replaced: step8ClearAction.replacedTarget,
  step8HardStop: step8ClearAction.keyBindings.actions.hardStop,
  matchSpaceAfterClear,
  step9Replaced: step9ClearPad.replacedTarget,
  step9HasPadMisc: 'pad-misc-timeout' in step9ClearPad.keyBindings.pads,
  matchF1AfterClear,
}));
"""
        res = run_ts_script(script)
        self.assertEqual(res["initialToggleDuckPreserved"], "D")
        self.assertIsNone(res["step1Replaced"])
        self.assertEqual(res["step1ToggleDuck"], "M")
        self.assertEqual(res["matchM"], {"type": "action", "id": "toggleDuck"})
        self.assertIsNone(res["matchOldD"])

        self.assertIsNone(res["step2Replaced"])
        self.assertEqual(res["step2PadOrgan"], "1")
        self.assertEqual(res["match1"], {"type": "pad", "id": "pad-organ-1"})

        self.assertEqual(res["step3Replaced"], "action:goalHome")
        self.assertEqual(res["step3GoalHome"], "")
        self.assertEqual(res["step3PadHype"], "F1")
        self.assertEqual(res["matchF1AfterPadSteal"], {"type": "pad", "id": "pad-hype-1"})

        self.assertEqual(res["step4Replaced"], "pad:pad-organ-1")
        self.assertFalse(res["step4HasPadOrgan"])
        self.assertEqual(res["step4GoalHome"], "1")
        self.assertEqual(res["match1AfterActionSteal"], {"type": "action", "id": "goalHome"})

        self.assertEqual(res["step5Replaced"], "pad:pad-hype-1")
        self.assertFalse(res["step5HasPadHype"])
        self.assertEqual(res["step5PadMisc"], "F1")
        self.assertEqual(res["matchF1AfterPadToPad"], {"type": "pad", "id": "pad-misc-timeout"})

        self.assertEqual(res["step6Replaced"], "action:fadeOut")
        self.assertEqual(res["step6FadeOut"], "")
        self.assertEqual(res["step6HardStop"], "Space")
        self.assertEqual(res["matchSpaceAfterActionToAction"], {"type": "action", "id": "hardStop"})

        self.assertIsNone(res["step7Replaced"])

        self.assertIsNone(res["step8Replaced"])
        self.assertEqual(res["step8HardStop"], "")
        self.assertIsNone(res["matchSpaceAfterClear"])

        self.assertIsNone(res["step9Replaced"])
        self.assertFalse(res["step9HasPadMisc"])
        self.assertIsNone(res["matchF1AfterClear"])

    def test_09_backward_compatible_sanitize_match_config(self) -> None:
        """Verify legacy snapshots without keyBindings/savedRosters/matchProfiles and empty spotifyClientId migrate without data loss."""
        script = """
import {
  DEFAULT_KEY_BINDINGS,
  DEFAULT_MATCH_PROFILES,
  DEFAULT_SAVED_ROSTERS,
  DEFAULT_SPOTIFY_CLIENT_ID,
} from './src/data/defaults.ts';
import { sanitizeMatchConfig } from './src/utils/domain.ts';

const legacySnapshot = {
  version: 1,
  teams: {
    home: {
      id: 'home',
      name: 'Hudiksvall HC',
      color: '#1e3a8a',
      roster: {
        '00': 'Olle Målvakt',
        '19': 'Karl Kämpe',
      },
    },
    away: {
      id: 'away',
      name: 'Njurunda SK',
      color: '#b91c1c',
      roster: {
        '00': 'Kalle Keeper',
        '88': 'Viktor Forward',
      },
    },
  },
  soundPads: [
    {
      id: 'legacy-pad-goal',
      label: 'Legacy Mållåt',
      category: 'goal_home',
      color: '#2563eb',
      volume: 0.75,
      triggerFlow: 'goal_home',
      tracks: [
        {
          trackUri: 'spotify:track:2KH16WveTQWT6KOG9Rg6e2',
          title: 'Legacy Goal Anthem',
          artist: 'Legacy Artist',
          startTimeMs: 12000,
        },
      ],
    },
    {
      id: 'legacy-pad-hype',
      label: 'Legacy Pepp',
      category: 'hype',
      color: '#059669',
      volume: 0.9,
      triggerFlow: null,
      tracks: [
        {
          trackUri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
          title: 'Legacy Hype Track',
          artist: 'Arena',
          startTimeMs: 30000,
        },
      ],
    },
  ],
  settings: {
    duckVolume: 0.32,
    fadeOutDurationMs: 750,
    spotifyClientId: '',
    spotifyRedirectUri: 'http://127.0.0.1:5173/callback',
    scriptTemplates: {
      penalty: '{team} utvisning #{number} {name}, {duration} ({reason}).',
      penaltyTeam: 'Lagstraff {team}, {duration} {reason}.',
      goal: 'Mål {team} #{scorerNumber} {scorerName}!',
      goalWithAssist: 'Mål {team} #{scorerNumber} {scorerName}, assist {assists}.',
    },
  },
};

const migrated = sanitizeMatchConfig(legacySnapshot);
const migratedFromEnvelope = sanitizeMatchConfig({ state: legacySnapshot, version: 1 });

const legacyWithPadHotkey = {
  ...legacySnapshot,
  soundPads: [
    legacySnapshot.soundPads[0],
    { ...legacySnapshot.soundPads[1], hotkey: 'Digit9' },
  ],
};
const migratedWithPadHotkey = sanitizeMatchConfig(legacyWithPadHotkey);

console.log(JSON.stringify({
  legacySnapshot,
  migrated,
  migratedFromEnvelope,
  migratedWithPadHotkey,
  expectedClientId: DEFAULT_SPOTIFY_CLIENT_ID,
  expectedKeyBindings: DEFAULT_KEY_BINDINGS,
  expectedSavedRosters: DEFAULT_SAVED_ROSTERS,
  expectedMatchProfiles: DEFAULT_MATCH_PROFILES,
}));
"""
        res = run_ts_script(script)
        legacy = res["legacySnapshot"]
        migrated = res["migrated"]

        self.assertEqual(res["expectedClientId"], "35b681ec04634ec3a6a5083ce87216c4")
        self.assertEqual(migrated["settings"]["spotifyClientId"], "35b681ec04634ec3a6a5083ce87216c4")
        self.assertEqual(migrated["settings"]["keyBindings"], res["expectedKeyBindings"])
        self.assertEqual(migrated["savedRosters"], res["expectedSavedRosters"])
        self.assertGreaterEqual(len(migrated["savedRosters"]), 4)
        self.assertEqual(migrated["matchProfiles"], res["expectedMatchProfiles"])
        self.assertGreaterEqual(len(migrated["matchProfiles"]), 2)

        # Verify zero data loss in existing teams, soundPads, and settings
        self.assertEqual(migrated["teams"], legacy["teams"])
        self.assertEqual(migrated["teams"]["home"]["roster"]["00"], "Olle Målvakt")
        self.assertEqual(migrated["teams"]["away"]["roster"]["00"], "Kalle Keeper")
        self.assertEqual(migrated["soundPads"], legacy["soundPads"])
        self.assertEqual(migrated["settings"]["duckVolume"], 0.32)
        self.assertEqual(migrated["settings"]["fadeOutDurationMs"], 750)
        self.assertEqual(migrated["settings"]["scriptTemplates"], legacy["settings"]["scriptTemplates"])

        # Verify Zustand persist envelope migration produces identical output
        self.assertEqual(res["migratedFromEnvelope"], migrated)

        # Verify legacy pad.hotkey adoption without losing DEFAULT_KEY_BINDINGS.actions
        with_hotkey = res["migratedWithPadHotkey"]
        self.assertEqual(
            with_hotkey["settings"]["keyBindings"]["actions"],
            res["expectedKeyBindings"]["actions"],
        )
        self.assertEqual(with_hotkey["settings"]["keyBindings"]["pads"].get("legacy-pad-hype"), "9")
        self.assertEqual(with_hotkey["soundPads"][1].get("hotkey"), "9")

    def test_10_extract_spotify_track_id(self) -> None:
        """Verify extractSpotifyTrackId extracts IDs from track URLs, intl-sv URLs, URIs, and returns null for invalid inputs."""
        script = """
import { extractSpotifyTrackId } from './src/utils/domain.ts';

const result = {
  exampleUrl: extractSpotifyTrackId('https://open.spotify.com/track/4QcBuV31ukMvsvviytKjWx?si=ccd5352978464589'),
  intlSvWithQuery: extractSpotifyTrackId('https://open.spotify.com/intl-sv/track/4QcBuV31ukMvsvviytKjWx?si=ccd5352978464589'),
  intlSvPlain: extractSpotifyTrackId('https://open.spotify.com/intl-sv/track/4QcBuV31ukMvsvviytKjWx'),
  spotifyUri: extractSpotifyTrackId('spotify:track:4QcBuV31ukMvsvviytKjWx'),
  trimmedUrl: extractSpotifyTrackId('  https://open.spotify.com/track/4QcBuV31ukMvsvviytKjWx?si=ccd5352978464589  '),
  invalidEmpty: extractSpotifyTrackId(''),
  invalidWhitespace: extractSpotifyTrackId('   '),
  invalidGarbage: extractSpotifyTrackId('not-a-spotify-link'),
  invalidHost: extractSpotifyTrackId('https://example.com/track/4QcBuV31ukMvsvviytKjWx'),
  invalidPlaylist: extractSpotifyTrackId('https://open.spotify.com/playlist/4QcBuV31ukMvsvviytKjWx'),
  invalidAlbum: extractSpotifyTrackId('https://open.spotify.com/album/4QcBuV31ukMvsvviytKjWx'),
  invalidShortId: extractSpotifyTrackId('https://open.spotify.com/track/4QcBuV31ukM'),
  invalidUriType: extractSpotifyTrackId('spotify:album:4QcBuV31ukMvsvviytKjWx'),
  invalidUriChars: extractSpotifyTrackId('spotify:track:4QcBuV31ukMvsvviytKjW!'),
};
console.log(JSON.stringify(result));
"""
        res = run_ts_script(script)
        expected_id = "4QcBuV31ukMvsvviytKjWx"
        self.assertEqual(res["exampleUrl"], expected_id)
        self.assertEqual(res["intlSvWithQuery"], expected_id)
        self.assertEqual(res["intlSvPlain"], expected_id)
        self.assertEqual(res["spotifyUri"], expected_id)
        self.assertEqual(res["trimmedUrl"], expected_id)

        for invalid_key in (
            "invalidEmpty",
            "invalidWhitespace",
            "invalidGarbage",
            "invalidHost",
            "invalidPlaylist",
            "invalidAlbum",
            "invalidShortId",
            "invalidUriType",
            "invalidUriChars",
        ):
            self.assertIsNone(
                res[invalid_key],
                f"Expected null for {invalid_key}, got {res[invalid_key]!r}",
            )

    def test_11_parse_spotify_metadata_payload(self) -> None:
        """Verify parseSpotifyMetadataPayload across Web API, Embed __NEXT_DATA__/HTML, oEmbed, and invalid payloads."""
        script = """
import { parseSpotifyMetadataPayload } from './src/utils/domain.ts';

const webApiMultiArtist = parseSpotifyMetadataPayload({
  id: '4QcBuV31ukMvsvviytKjWx',
  name: 'Goal Horn Anthem',
  artists: [
    { name: 'Artist Ett' },
    { name: 'Artist Två' },
    { name: 'DJ Hockey' },
  ],
});

const webApiJsonString = parseSpotifyMetadataPayload(JSON.stringify({
  name: 'Powerplay Riff',
  artists: [{ name: 'Band A' }, { name: 'Band B' }],
}));

const embedNextDataObj = parseSpotifyMetadataPayload({
  props: {
    pageProps: {
      state: {
        data: {
          entity: {
            name: 'Embed Track Title',
            artists: [{ name: 'Embed Artist 1' }, { name: 'Embed Artist 2' }],
          },
        },
      },
    },
  },
});

const embedNextDataSubtitleFallback = parseSpotifyMetadataPayload(JSON.stringify({
  props: {
    pageProps: {
      state: {
        data: {
          entity: {
            title: 'Embed Subtitle Track',
            subtitle: 'Embed Subtitle Artist',
          },
        },
      },
    },
  },
}));

const embedHtmlNextData = parseSpotifyMetadataPayload(`
  <!doctype html>
  <html>
    <head><title>Spotify</title></head>
    <body>
      <script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{"state":{"data":{"entity":{"name":"HTML NextData Song","artists":[{"name":"NextData Artist 1"},{"name":"NextData Artist 2"}]}}}}}}
      </script>
    </body>
  </html>
`);

const embedHtmlTitleFallbackEn = parseSpotifyMetadataPayload(`
  <!doctype html>
  <html>
    <head>
      <title>Hockey Victory - song and lyrics by Arena Rockers | Spotify</title>
    </head>
    <body></body>
  </html>
`);

const embedHtmlTitleFallbackSv = parseSpotifyMetadataPayload(`
  <!doctype html>
  <html>
    <head>
      <title>Målfest i Hallen - låt och text av Hemmalaget | Spotify</title>
    </head>
    <body></body>
  </html>
`);

const embedHtmlTitleFallbackDashEntities = parseSpotifyMetadataPayload(`
  <!doctype html>
  <html>
    <head>
      <script id="__NEXT_DATA__" type="application/json">{broken json</script>
      <title>Rock &amp; Goal - The Skates &amp; Co | Spotify</title>
    </head>
    <body></body>
  </html>
`);

const oembedTitleDashArtist = parseSpotifyMetadataPayload({
  title: 'Slapshot - Puck Rockers',
  author_name: 'Spotify',
  provider_name: 'Spotify',
});

const oembedAuthorName = parseSpotifyMetadataPayload({
  title: 'Sudden Death',
  author_name: 'Arena Brass',
  provider_name: 'Spotify',
});

const oembedTitleDashNoAuthor = parseSpotifyMetadataPayload({
  title: 'Overtime Hero - Ice Breakers',
});

const invalidNull = parseSpotifyMetadataPayload(null);
const invalidUndefined = parseSpotifyMetadataPayload(undefined);
const invalidNumber = parseSpotifyMetadataPayload(12345);
const invalidArray = parseSpotifyMetadataPayload(['track']);
const invalidEmptyObj = parseSpotifyMetadataPayload({});
const invalidEmptyStr = parseSpotifyMetadataPayload('');
const invalidWhitespace = parseSpotifyMetadataPayload('   ');
const invalidPlainText = parseSpotifyMetadataPayload('plain text without metadata');
const invalidGenericHtml = parseSpotifyMetadataPayload('<html><head><title>Spotify – Web Player</title></head></html>');
const invalidBlankNameWebApi = parseSpotifyMetadataPayload({ name: '   ', artists: [{ name: 'Ghost' }] });
const invalidBlankTitleOembed = parseSpotifyMetadataPayload({ title: '  ', author_name: 'Artist' });

console.log(JSON.stringify({
  webApiMultiArtist,
  webApiJsonString,
  embedNextDataObj,
  embedNextDataSubtitleFallback,
  embedHtmlNextData,
  embedHtmlTitleFallbackEn,
  embedHtmlTitleFallbackSv,
  embedHtmlTitleFallbackDashEntities,
  oembedTitleDashArtist,
  oembedAuthorName,
  oembedTitleDashNoAuthor,
  invalidNull,
  invalidUndefined,
  invalidNumber,
  invalidArray,
  invalidEmptyObj,
  invalidEmptyStr,
  invalidWhitespace,
  invalidPlainText,
  invalidGenericHtml,
  invalidBlankNameWebApi,
  invalidBlankTitleOembed,
}));
"""
        res = run_ts_script(script)
        self.assertEqual(
            res["webApiMultiArtist"],
            {"title": "Goal Horn Anthem", "artist": "Artist Ett, Artist Två, DJ Hockey"},
        )
        self.assertEqual(
            res["webApiJsonString"],
            {"title": "Powerplay Riff", "artist": "Band A, Band B"},
        )
        self.assertEqual(
            res["embedNextDataObj"],
            {"title": "Embed Track Title", "artist": "Embed Artist 1, Embed Artist 2"},
        )
        self.assertEqual(
            res["embedNextDataSubtitleFallback"],
            {"title": "Embed Subtitle Track", "artist": "Embed Subtitle Artist"},
        )
        self.assertEqual(
            res["embedHtmlNextData"],
            {"title": "HTML NextData Song", "artist": "NextData Artist 1, NextData Artist 2"},
        )
        self.assertEqual(
            res["embedHtmlTitleFallbackEn"],
            {"title": "Hockey Victory", "artist": "Arena Rockers"},
        )
        self.assertEqual(
            res["embedHtmlTitleFallbackSv"],
            {"title": "Målfest i Hallen", "artist": "Hemmalaget"},
        )
        self.assertEqual(
            res["embedHtmlTitleFallbackDashEntities"],
            {"title": "Rock & Goal", "artist": "The Skates & Co"},
        )
        self.assertEqual(
            res["oembedTitleDashArtist"],
            {"title": "Slapshot", "artist": "Puck Rockers"},
        )
        self.assertEqual(
            res["oembedAuthorName"],
            {"title": "Sudden Death", "artist": "Arena Brass"},
        )
        self.assertEqual(
            res["oembedTitleDashNoAuthor"],
            {"title": "Overtime Hero", "artist": "Ice Breakers"},
        )

        for invalid_key in (
            "invalidNull",
            "invalidUndefined",
            "invalidNumber",
            "invalidArray",
            "invalidEmptyObj",
            "invalidEmptyStr",
            "invalidWhitespace",
            "invalidPlainText",
            "invalidGenericHtml",
            "invalidBlankNameWebApi",
            "invalidBlankTitleOembed",
        ):
            self.assertIsNone(
                res[invalid_key],
                f"Expected null for {invalid_key}, got {res[invalid_key]!r}",
            )

    def test_12_away_goal_silence_sanitize_match_config(self) -> None:
        """Verify awayGoalSilence defaults to true in legacy configs and preserves explicit true/false in settings and MatchProfile.settings."""
        script = """
import { DEFAULT_SETTINGS, DEFAULT_SOUND_PADS } from './src/data/defaults.ts';
import { sanitizeMatchConfig } from './src/utils/domain.ts';

const legacyWithoutAwayGoalSilence = sanitizeMatchConfig({
  version: 1,
  settings: {
    duckVolume: 0.25,
    fadeOutDurationMs: 500,
  },
});

const missingSettingsCompletely = sanitizeMatchConfig({
  version: 1,
});

const invalidTypeAwayGoalSilence = sanitizeMatchConfig({
  version: 1,
  settings: {
    awayGoalSilence: 'false',
  },
});

const explicitFalse = sanitizeMatchConfig({
  version: 1,
  settings: {
    awayGoalSilence: false,
  },
  matchProfiles: [
    {
      id: 'prof-false',
      name: 'Profil Tystnad AV',
      soundPads: DEFAULT_SOUND_PADS,
      settings: {
        duckVolume: 0.3,
        awayGoalSilence: false,
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'prof-true',
      name: 'Profil Tystnad PÅ',
      soundPads: DEFAULT_SOUND_PADS,
      settings: {
        duckVolume: 0.2,
        awayGoalSilence: true,
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
});

const explicitTrue = sanitizeMatchConfig({
  version: 1,
  settings: {
    awayGoalSilence: true,
  },
});

console.log(JSON.stringify({
  defaultSetting: DEFAULT_SETTINGS.awayGoalSilence,
  legacyValue: legacyWithoutAwayGoalSilence.settings.awayGoalSilence,
  missingSettingsValue: missingSettingsCompletely.settings.awayGoalSilence,
  invalidTypeValue: invalidTypeAwayGoalSilence.settings.awayGoalSilence,
  explicitFalseSetting: explicitFalse.settings.awayGoalSilence,
  explicitTrueSetting: explicitTrue.settings.awayGoalSilence,
  profileFalseSetting: explicitFalse.matchProfiles?.find((p) => p.id === 'prof-false')?.settings?.awayGoalSilence,
  profileTrueSetting: explicitFalse.matchProfiles?.find((p) => p.id === 'prof-true')?.settings?.awayGoalSilence,
}));
"""
        res = run_ts_script(script)
        self.assertIs(res["defaultSetting"], True)
        self.assertIs(res["legacyValue"], True)
        self.assertIs(res["missingSettingsValue"], True)
        self.assertIs(res["invalidTypeValue"], True)
        self.assertIs(res["explicitFalseSetting"], False)
        self.assertIs(res["explicitTrueSetting"], True)
        self.assertIs(res["profileFalseSetting"], False)
        self.assertIs(res["profileTrueSetting"], True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
