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

    def test_13_sanitize_soundboard_groups_custom_exclusions_and_dedup(self) -> None:
        """Verify sanitizeSoundboardGroups handles custom groups, event-category exclusion, deduplication, fallbacks, and label resolution."""
        script = """
import {
  DEFAULT_SOUNDBOARD_GROUPS,
  PAD_CATEGORY_LABELS,
  getPadCategoryLabel,
} from './src/data/defaults.ts';
import { sanitizeSoundboardGroups } from './src/utils/domain.ts';

const customAndEventMixed = sanitizeSoundboardGroups([
  { id: '  group-intro  ', label: '  Intro & Uppvärmning  ', isBuiltin: false },
  { id: 'goal_home', label: 'Otillåten Mål Hemma' },
  { id: 'goal_away', label: 'Otillåten Mål Borta' },
  { id: 'penalty_home', label: 'Otillåten Utv Hemma' },
  { id: 'penalty_away', label: 'Otillåten Utv Borta' },
  { id: 'group-intro', label: 'Dubblett som ska ignoreras', isBuiltin: false },
  { id: 'hype', label: 'Pepp & Tryck' },
  { id: 'hype', label: 'Dubblett Hype' },
  { id: '', label: 'Tomt ID' },
  { id: 'group-no-label', label: '   ' },
  null,
  'invalid-entry',
]);

const fallbackUsedWhenEmpty = sanitizeSoundboardGroups(
  [
    { id: 'goal_home', label: 'Bara Händelsekategori' },
    { id: '', label: 'Ogiltig' },
  ],
  [
    { id: 'group-custom-fb', label: 'Fallback Grupp', isBuiltin: false },
    { id: 'penalty_away', label: 'Bortfiltrerad Fallback' },
  ],
);

const defaultsUsedWhenBothEmpty = sanitizeSoundboardGroups([], []);

const labelCustom = getPadCategoryLabel('group-intro', customAndEventMixed);
const labelOverriddenBuiltin = getPadCategoryLabel('hype', customAndEventMixed);
const labelDefaultFallback = getPadCategoryLabel('organ', customAndEventMixed);
const labelUnknown = getPadCategoryLabel('unknown-group-id', customAndEventMixed);

console.log(JSON.stringify({
  customAndEventMixed,
  fallbackUsedWhenEmpty,
  defaultsUsedWhenBothEmpty,
  defaultGroups: DEFAULT_SOUNDBOARD_GROUPS,
  hypeDefaultLabel: PAD_CATEGORY_LABELS.hype,
  labelCustom,
  labelOverriddenBuiltin,
  labelDefaultFallback,
  labelUnknown,
}));
"""
        res = run_ts_script(script)
        self.assertEqual(
            res["customAndEventMixed"],
            [
                {"id": "group-intro", "label": "Intro & Uppvärmning", "isBuiltin": False},
                {"id": "hype", "label": "Pepp & Tryck", "isBuiltin": True},
            ],
        )
        self.assertEqual(
            res["fallbackUsedWhenEmpty"],
            [
                {"id": "group-custom-fb", "label": "Fallback Grupp", "isBuiltin": False},
            ],
        )
        self.assertEqual(res["defaultsUsedWhenBothEmpty"], res["defaultGroups"])
        self.assertEqual(res["labelCustom"], "Intro & Uppvärmning")
        self.assertEqual(res["labelOverriddenBuiltin"], "Pepp & Tryck")
        self.assertEqual(res["labelDefaultFallback"], "Orgel / Publikpepp")
        self.assertEqual(res["labelUnknown"], "unknown-group-id")

    def test_14_sanitize_match_config_custom_groups_pads_and_self_healing(self) -> None:
        """Verify sanitizeMatchConfig & sanitizeMatchProfile preserve custom pad categories, exclude event categories, deduplicate, and self-heal unknown pad categories."""
        script = """
import { DEFAULT_SOUNDBOARD_GROUPS, PAD_CATEGORY_LABELS } from './src/data/defaults.ts';
import { sanitizeMatchConfig, sanitizeMatchProfile, sanitizeSoundboardGroups } from './src/utils/domain.ts';

// 1. Direct sanitizeSoundboardGroups self-healing with unknown custom & omitted builtin categories, ignoring event categories and duplicates
const selfHealedDirect = sanitizeSoundboardGroups(
  [
    { id: 'group-intro', label: 'Intro & Uppvärmning', isBuiltin: false },
    { id: 'goal_home', label: 'Bortfiltrerad' },
  ],
  undefined,
  [
    {
      id: 'pad-1',
      label: 'Intro Låt',
      category: 'group-intro',
      color: '#2563eb',
      tracks: [],
    },
    {
      id: 'pad-2',
      label: 'Uppvärmnings-jingle',
      category: 'custom-warmup-pool',
      color: '#059669',
      tracks: [],
    },
    {
      id: 'pad-3',
      label: 'Uppvärmning 2 (samma okända kategori)',
      category: 'custom-warmup-pool',
      color: '#059669',
      tracks: [],
    },
    {
      id: 'pad-4',
      label: 'Orgel utan grupp i rawGroups',
      category: 'organ',
      color: '#d97706',
      tracks: [],
    },
    {
      id: 'pad-event-goal',
      label: 'Mållåt',
      category: 'goal_home',
      color: '#2563eb',
      tracks: [],
    },
    {
      id: 'pad-event-pen-away',
      label: 'Powerplay',
      category: 'penalty_away',
      color: '#dc2626',
      tracks: [],
    },
  ],
);

// 2. Full sanitizeMatchConfig with custom groups, custom pad categories, event-category exclusions, duplicate group IDs, and self-healing pad
const rawConfig = {
  version: 1,
  soundPads: [
    {
      id: 'pad-custom-intro',
      label: 'Entré',
      category: '  group-intro  ',
      color: '#1d4ed8',
      volume: 0.9,
      triggerFlow: null,
      tracks: [
        {
          trackUri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
          title: 'Intro Song',
          artist: 'Arena',
          startTimeMs: 0,
        },
      ],
    },
    {
      id: 'pad-unregistered-custom',
      label: 'Pausquiz',
      category: 'crowd_chant',
      color: '#0ea5e9',
      volume: 1.0,
      triggerFlow: null,
      tracks: [],
    },
    {
      id: 'pad-empty-category',
      label: 'Saknar kategori',
      category: '   ',
      color: '#334155',
      volume: 1.0,
      triggerFlow: null,
      tracks: [],
    },
    {
      id: 'pad-goal-away',
      label: 'Bortamål',
      category: 'goal_away',
      color: '#ea580c',
      volume: 1.0,
      triggerFlow: 'goal_away',
      tracks: [],
    },
    {
      id: 'pad-penalty-home',
      label: 'Boxplay',
      category: 'penalty_home',
      color: '#1d4ed8',
      volume: 1.0,
      triggerFlow: 'penalty_home',
      tracks: [],
    },
  ],
  settings: {
    soundboardGroups: [
      { id: 'group-intro', label: 'Intro & Uppvärmning', isBuiltin: false },
      { id: 'group-intro', label: 'Dubblett Intro', isBuiltin: false },
      { id: 'goal_home', label: 'Får ej synas' },
      { id: 'goal_away', label: 'Får ej synas' },
      { id: 'penalty_home', label: 'Får ej synas' },
      { id: 'penalty_away', label: 'Får ej synas' },
      { id: 'misc', label: 'Övrigt / Paus', isBuiltin: true },
    ],
  },
  matchProfiles: [
    {
      id: 'prof-custom-groups',
      name: 'Profil med egna grupper',
      soundPads: [
        {
          id: 'prof-pad-1',
          label: 'Profil-knapp',
          category: 'group-intro',
          color: '#2563eb',
          tracks: [],
        },
        {
          id: 'prof-pad-healed',
          label: 'Självläkt profilknapp',
          category: 'intermission-show',
          color: '#059669',
          tracks: [],
        },
      ],
      settings: {
        soundboardGroups: [
          { id: 'group-intro', label: 'Intro & Uppvärmning', isBuiltin: false },
          { id: 'penalty_home', label: 'Exkluderas i profil' },
        ],
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

const sanitizedConfig = sanitizeMatchConfig(rawConfig);

// 3. Legacy snapshot without settings.soundboardGroups but with a custom pad category
const legacyWithCustomPad = sanitizeMatchConfig({
  version: 1,
  soundPads: [
    {
      id: 'legacy-custom-pad',
      label: 'Legacy Custom',
      category: 'period-break-mix',
      color: '#475569',
      tracks: [],
    },
  ],
});

const directProfile = sanitizeMatchProfile(rawConfig.matchProfiles[0]);

console.log(JSON.stringify({
  selfHealedDirect,
  sanitizedConfig,
  legacyWithCustomPadGroups: legacyWithCustomPad.settings.soundboardGroups,
  legacyCustomPadCategory: legacyWithCustomPad.soundPads[0].category,
  directProfile,
  defaultGroupsCount: DEFAULT_SOUNDBOARD_GROUPS.length,
  organBuiltinLabel: PAD_CATEGORY_LABELS.organ,
}));
"""
        res = run_ts_script(script)

        self.assertEqual(
            res["selfHealedDirect"],
            [
                {"id": "group-intro", "label": "Intro & Uppvärmning", "isBuiltin": False},
                {"id": "custom-warmup-pool", "label": "Custom Warmup Pool"},
                {"id": "organ", "label": res["organBuiltinLabel"], "isBuiltin": True},
            ],
        )

        cfg = res["sanitizedConfig"]
        pads_by_id = {pad["id"]: pad for pad in cfg["soundPads"]}
        self.assertEqual(pads_by_id["pad-custom-intro"]["category"], "group-intro")
        self.assertEqual(pads_by_id["pad-unregistered-custom"]["category"], "crowd_chant")
        self.assertEqual(pads_by_id["pad-empty-category"]["category"], "misc")
        self.assertEqual(pads_by_id["pad-goal-away"]["category"], "goal_away")
        self.assertEqual(pads_by_id["pad-penalty-home"]["category"], "penalty_home")

        groups = cfg["settings"]["soundboardGroups"]
        self.assertEqual(
            groups,
            [
                {"id": "group-intro", "label": "Intro & Uppvärmning", "isBuiltin": False},
                {"id": "misc", "label": "Övrigt / Paus", "isBuiltin": True},
                {"id": "crowd_chant", "label": "Crowd Chant"},
            ],
        )

        group_ids = [g["id"] for g in groups]
        self.assertEqual(len(group_ids), len(set(group_ids)))
        for event_cat in ("goal_home", "goal_away", "penalty_home", "penalty_away"):
            self.assertNotIn(event_cat, group_ids)

        prof = cfg["matchProfiles"][0]
        self.assertEqual(
            prof["settings"]["soundboardGroups"],
            [
                {"id": "group-intro", "label": "Intro & Uppvärmning", "isBuiltin": False},
                {"id": "intermission-show", "label": "Intermission Show"},
            ],
        )
        self.assertEqual(prof["soundPads"][0]["category"], "group-intro")
        self.assertEqual(prof["soundPads"][1]["category"], "intermission-show")
        self.assertEqual(res["directProfile"], prof)

        legacy_groups = res["legacyWithCustomPadGroups"]
        self.assertEqual(len(legacy_groups), res["defaultGroupsCount"] + 1)
        self.assertEqual(
            legacy_groups[-1],
            {"id": "period-break-mix", "label": "Period Break Mix"},
        )
        self.assertEqual(res["legacyCustomPadCategory"], "period-break-mix")

    def test_15_local_audio_uri_and_filename_parsing(self) -> None:
        """Verify isLocalAudioUri, createLocalAudioUri, tryParseSpotifyUri/parseSpotifyUri, extractSpotifyTrackId(local), and parseLocalAudioFilename."""
        script = """
import {
  createLocalAudioUri,
  extractSpotifyTrackId,
  isLocalAudioUri,
  parseLocalAudioFilename,
  parseSpotifyUri,
  tryParseSpotifyUri,
} from './src/utils/domain.ts';

function expectThrows(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const generatedA = createLocalAudioUri();
const generatedB = createLocalAudioUri();

const result = {
  isValidSimple: isLocalAudioUri('local:audio:test_1'),
  isValidTrimmed: isLocalAudioUri('  local:audio:goal-horn_01  '),
  isInvalidTooShort: isLocalAudioUri('local:audio:ab'),
  isInvalidSpaces: isLocalAudioUri('local:audio:bad space'),
  isInvalidSpotify: isLocalAudioUri('spotify:track:4uLU6hMCjMI75M1A2tKUQC'),
  isInvalidEmpty: isLocalAudioUri(''),
  createdCustomId: createLocalAudioUri('horn_01'),
  createdAlreadyUri: createLocalAudioUri('local:audio:already_valid'),
  createdSanitized: createLocalAudioUri('Goal Horn! #1'),
  generatedA,
  generatedB,
  generatedAValid: isLocalAudioUri(generatedA),
  generatedBValid: isLocalAudioUri(generatedB),
  tryLocalOk: tryParseSpotifyUri('local:audio:test_1'),
  tryLocalTrimmedOk: tryParseSpotifyUri('  local:audio:horn-99  '),
  tryLocalInvalid: tryParseSpotifyUri('local:audio:x'),
  parseLocalOk: parseSpotifyUri('local:audio:test_1'),
  parseLocalInvalidThrows: expectThrows(() => parseSpotifyUri('local:audio:x')),
  extractLocalNull: extractSpotifyTrackId('local:audio:test_1'),
  extractLocalTrimmedNull: extractSpotifyTrackId('  local:audio:goal_horn_1  '),
  parsedArtistTitle: parseLocalAudioFilename('Zombie Nation - Kernkraft 400.mp3'),
  parsedGoalHorn: parseLocalAudioFilename('Goal_Horn_Sundsvall.wav'),
  parsedWindowsPath: parseLocalAudioFilename('C:\\\\Audio\\\\Arena_DJ - Power_Play.ogg'),
  parsedEnDash: parseLocalAudioFilename('Track – Subtitle.m4a'),
  parsedEmpty: parseLocalAudioFilename(''),
};

console.log(JSON.stringify(result));
"""
        res = run_ts_script(script)

        self.assertTrue(res["isValidSimple"])
        self.assertTrue(res["isValidTrimmed"])
        self.assertFalse(res["isInvalidTooShort"])
        self.assertFalse(res["isInvalidSpaces"])
        self.assertFalse(res["isInvalidSpotify"])
        self.assertFalse(res["isInvalidEmpty"])

        self.assertEqual(res["createdCustomId"], "local:audio:horn_01")
        self.assertEqual(res["createdAlreadyUri"], "local:audio:already_valid")
        self.assertEqual(res["createdSanitized"], "local:audio:Goal-Horn-1")
        self.assertTrue(res["generatedAValid"])
        self.assertTrue(res["generatedBValid"])
        self.assertTrue(res["generatedA"].startswith("local:audio:"))
        self.assertTrue(res["generatedB"].startswith("local:audio:"))

        self.assertEqual(res["tryLocalOk"], {"ok": True, "uri": "local:audio:test_1"})
        self.assertEqual(res["tryLocalTrimmedOk"], {"ok": True, "uri": "local:audio:horn-99"})
        self.assertFalse(res["tryLocalInvalid"]["ok"])
        self.assertEqual(res["parseLocalOk"], "local:audio:test_1")
        self.assertTrue(res["parseLocalInvalidThrows"])

        self.assertIsNone(res["extractLocalNull"])
        self.assertIsNone(res["extractLocalTrimmedNull"])

        self.assertEqual(
            res["parsedArtistTitle"],
            {"title": "Kernkraft 400", "artist": "Zombie Nation"},
        )
        self.assertEqual(
            res["parsedGoalHorn"],
            {"title": "Goal Horn Sundsvall", "artist": "Lokal ljudfil"},
        )
        self.assertEqual(
            res["parsedWindowsPath"],
            {"title": "Power Play", "artist": "Arena DJ"},
        )
        self.assertEqual(
            res["parsedEnDash"],
            {"title": "Subtitle", "artist": "Track"},
        )
        self.assertEqual(
            res["parsedEmpty"],
            {"title": "Lokal ljudfil", "artist": "Lokal ljudfil"},
        )

    def test_16_sanitize_match_config_local_audio_tracks(self) -> None:
        """Verify sanitizeMatchConfig preserves local audio metadata, explicit spotify sourceType, and omits sourceType on legacy/mismatched Spotify tracks."""
        script = """
import { sanitizeMatchConfig } from './src/utils/domain.ts';

const rawConfig = {
  version: 1,
  soundPads: [
    {
      id: 'pad-local-goal',
      label: 'Lokalt Målhorn',
      category: 'goal_home',
      color: '#2563eb',
      volume: 0.95,
      triggerFlow: 'goal_home',
      tracks: [
        {
          trackUri: 'local:audio:horn_01',
          title: 'Goal Horn Sundsvall',
          artist: 'Lokal ljudfil',
          startTimeMs: 1200,
          sourceType: 'local',
          localFileName: 'Goal_Horn_Sundsvall.wav',
          mimeType: 'audio/wav',
        },
        {
          trackUri: 'local:audio:kernkraft_400',
          title: 'Kernkraft 400',
          artist: 'Zombie Nation',
          startTimeMs: 45000,
          sourceType: 'spotify',
          localFileName: 'Zombie Nation - Kernkraft 400.mp3',
          mimeType: 'audio/mpeg',
        },
        {
          trackUri: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
          title: 'Spotify Legacy Track',
          artist: 'Arena Band',
          startTimeMs: 0,
        },
        {
          trackUri: 'spotify:track:2KH16WveTQWT6KOG9Rg6e2',
          title: 'Spotify Explicit Track',
          artist: 'Survivor',
          startTimeMs: 42000,
          sourceType: 'spotify',
        },
        {
          trackUri: 'spotify:track:5CQ30WqJwcep0pYcV4AMNc',
          title: 'Spotify Mismatched SourceType',
          artist: 'House of Pain',
          startTimeMs: 18000,
          sourceType: 'local',
          localFileName: 'should_not_persist.mp3',
          mimeType: 'audio/mpeg',
        },
      ],
    },
  ],
  matchProfiles: [
    {
      id: 'prof-local-audio',
      name: 'Profil med lokalt ljud',
      soundPads: [
        {
          id: 'prof-pad-local',
          label: 'Profil Lokal Jingle',
          category: 'hype',
          color: '#059669',
          volume: 0.9,
          triggerFlow: null,
          tracks: [
            {
              trackUri: 'local:audio:profile_horn_99',
              title: 'Period Jingle',
              artist: 'Arena Audio',
              startTimeMs: 500,
              sourceType: 'local',
              localFileName: 'Period_Jingle.ogg',
              mimeType: 'audio/ogg',
            },
          ],
        },
      ],
      updatedAt: '2026-11-19T12:00:00.000Z',
    },
  ],
};

const sanitized = sanitizeMatchConfig(rawConfig);
const sanitizedFromEnvelope = sanitizeMatchConfig({ state: rawConfig, version: 1 });

console.log(JSON.stringify({
  sanitized,
  sanitizedFromEnvelope,
}));
"""
        res = run_ts_script(script)
        cfg = res["sanitized"]
        self.assertEqual(res["sanitizedFromEnvelope"], cfg)

        tracks = cfg["soundPads"][0]["tracks"]
        self.assertEqual(len(tracks), 5)

        self.assertEqual(
            tracks[0],
            {
                "trackUri": "local:audio:horn_01",
                "title": "Goal Horn Sundsvall",
                "artist": "Lokal ljudfil",
                "startTimeMs": 1200,
                "sourceType": "local",
                "localFileName": "Goal_Horn_Sundsvall.wav",
                "mimeType": "audio/wav",
            },
        )
        self.assertEqual(
            tracks[1],
            {
                "trackUri": "local:audio:kernkraft_400",
                "title": "Kernkraft 400",
                "artist": "Zombie Nation",
                "startTimeMs": 45000,
                "sourceType": "local",
                "localFileName": "Zombie Nation - Kernkraft 400.mp3",
                "mimeType": "audio/mpeg",
            },
        )
        self.assertEqual(
            tracks[2],
            {
                "trackUri": "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
                "title": "Spotify Legacy Track",
                "artist": "Arena Band",
                "startTimeMs": 0,
            },
        )
        self.assertNotIn("sourceType", tracks[2])
        self.assertEqual(
            tracks[3],
            {
                "trackUri": "spotify:track:2KH16WveTQWT6KOG9Rg6e2",
                "title": "Spotify Explicit Track",
                "artist": "Survivor",
                "startTimeMs": 42000,
                "sourceType": "spotify",
            },
        )
        self.assertEqual(
            tracks[4],
            {
                "trackUri": "spotify:track:5CQ30WqJwcep0pYcV4AMNc",
                "title": "Spotify Mismatched SourceType",
                "artist": "House of Pain",
                "startTimeMs": 18000,
            },
        )
        self.assertNotIn("sourceType", tracks[4])
        self.assertNotIn("localFileName", tracks[4])
        self.assertNotIn("mimeType", tracks[4])

        profile_tracks = cfg["matchProfiles"][0]["soundPads"][0]["tracks"]
        self.assertEqual(
            profile_tracks,
            [
                {
                    "trackUri": "local:audio:profile_horn_99",
                    "title": "Period Jingle",
                    "artist": "Arena Audio",
                    "startTimeMs": 500,
                    "sourceType": "local",
                    "localFileName": "Period_Jingle.ogg",
                    "mimeType": "audio/ogg",
                }
            ],
        )

    def test_17_is_accepted_audio_file_name(self) -> None:
        """Verify isAcceptedAudioFileName accepts all 8 audio extensions case-insensitively and rejects non-audio or hidden files."""
        script = """
import {
  ACCEPTED_AUDIO_EXTENSIONS,
  isAcceptedAudioFileName,
} from './src/utils/domain.ts';

const accepted = {
  mp3Lower: isAcceptedAudioFileName('horn.mp3'),
  wavLower: isAcceptedAudioFileName('goal.wav'),
  oggLower: isAcceptedAudioFileName('chant.ogg'),
  m4aLower: isAcceptedAudioFileName('organ.m4a'),
  flacLower: isAcceptedAudioFileName('anthem.flac'),
  aacLower: isAcceptedAudioFileName('jingle.aac'),
  webmLower: isAcceptedAudioFileName('clip.webm'),
  opusLower: isAcceptedAudioFileName('drop.opus'),
  mp3Upper: isAcceptedAudioFileName('GOAL_HORN.MP3'),
  wavMixed: isAcceptedAudioFileName('PowerPlay.Wav'),
  oggMixed: isAcceptedAudioFileName('Arena_Chant.OgG'),
  m4aTrimmed: isAcceptedAudioFileName('  Organ_Loop.M4a  '),
  flacNestedPosix: isAcceptedAudioFileName('intermission/Anthem.FLAC'),
  aacMixed: isAcceptedAudioFileName('Jingle.AaC'),
  webmMixed: isAcceptedAudioFileName('Clip.WeBm'),
  opusNestedWin: isAcceptedAudioFileName('C:\\\\Media\\\\Sounds\\\\Drop.OPUS'),
};

const rejected = {
  txt: isAcceptedAudioFileName('readme.txt'),
  png: isAcceptedAudioFileName('logo.png'),
  gitkeep: isAcceptedAudioFileName('.gitkeep'),
  dsStore: isAcceptedAudioFileName('.DS_Store'),
  hiddenMp3: isAcceptedAudioFileName('.hidden.mp3'),
  hiddenNestedPosix: isAcceptedAudioFileName('subfolder/.hidden.wav'),
  hiddenNestedWin: isAcceptedAudioFileName('C:\\\\Audio\\\\.secret.ogg'),
  empty: isAcceptedAudioFileName(''),
  whitespace: isAcceptedAudioFileName('   '),
  trailingSlashPosix: isAcceptedAudioFileName('folder/'),
  trailingSlashWin: isAcceptedAudioFileName('folder\\\\'),
  noDotMp3: isAcceptedAudioFileName('mp3'),
  noExtension: isAcceptedAudioFileName('noextension'),
  backupExt: isAcceptedAudioFileName('song.mp3.bak'),
};

console.log(JSON.stringify({
  acceptedExtensions: [...ACCEPTED_AUDIO_EXTENSIONS],
  accepted,
  rejected,
}));
"""
        res = run_ts_script(script)
        self.assertEqual(
            res["acceptedExtensions"],
            [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".webm", ".opus"],
        )
        for key, val in res["accepted"].items():
            self.assertIs(val, True, f"Expected True for accepted case {key!r}, got {val!r}")
        for key, val in res["rejected"].items():
            self.assertIs(val, False, f"Expected False for rejected case {key!r}, got {val!r}")

    def test_18_infer_audio_mime_type(self) -> None:
        """Verify inferAudioMimeType maps all supported audio extensions (case-insensitive) and returns octet-stream fallback."""
        script = """
import { inferAudioMimeType } from './src/utils/domain.ts';

console.log(JSON.stringify({
  mp3Lower: inferAudioMimeType('speaker.mp3'),
  mp3UpperNested: inferAudioMimeType('archive/SPEAKER.MP3'),
  wavLower: inferAudioMimeType('horn.wav'),
  wavUpper: inferAudioMimeType('HORN.WAV'),
  oggLower: inferAudioMimeType('chant.ogg'),
  oggUpper: inferAudioMimeType('CHANT.OGG'),
  ogaLower: inferAudioMimeType('chant.oga'),
  m4aLower: inferAudioMimeType('organ.m4a'),
  m4aUpper: inferAudioMimeType('ORGAN.M4A'),
  mp4Lower: inferAudioMimeType('clip.mp4'),
  flacLower: inferAudioMimeType('anthem.flac'),
  flacUpper: inferAudioMimeType('ANTHEM.FLAC'),
  aacLower: inferAudioMimeType('jingle.aac'),
  aacUpper: inferAudioMimeType('JINGLE.AAC'),
  webmLower: inferAudioMimeType('stream.webm'),
  webmUpper: inferAudioMimeType('STREAM.WEBM'),
  opusLower: inferAudioMimeType('voice.opus'),
  opusUpper: inferAudioMimeType('VOICE.OPUS'),
  txtFallback: inferAudioMimeType('notes.txt'),
  pngFallback: inferAudioMimeType('cover.png'),
  gitkeepFallback: inferAudioMimeType('.gitkeep'),
  emptyFallback: inferAudioMimeType(''),
  noExtFallback: inferAudioMimeType('audiofile'),
}));
"""
        res = run_ts_script(script)
        expected = {
            "mp3Lower": "audio/mpeg",
            "mp3UpperNested": "audio/mpeg",
            "wavLower": "audio/wav",
            "wavUpper": "audio/wav",
            "oggLower": "audio/ogg",
            "oggUpper": "audio/ogg",
            "ogaLower": "audio/ogg",
            "m4aLower": "audio/mp4",
            "m4aUpper": "audio/mp4",
            "mp4Lower": "audio/mp4",
            "flacLower": "audio/flac",
            "flacUpper": "audio/flac",
            "aacLower": "audio/aac",
            "aacUpper": "audio/aac",
            "webmLower": "audio/webm",
            "webmUpper": "audio/webm",
            "opusLower": "audio/opus",
            "opusUpper": "audio/opus",
            "txtFallback": "application/octet-stream",
            "pngFallback": "application/octet-stream",
            "gitkeepFallback": "application/octet-stream",
            "emptyFallback": "application/octet-stream",
            "noExtFallback": "application/octet-stream",
        }
        for key, mime in expected.items():
            self.assertEqual(res[key], mime, f"MIME mismatch for {key!r}")

    def test_19_build_embedded_media_uri(self) -> None:
        """Verify buildEmbeddedMediaUri produces deterministic, valid local:audio:media-... URIs without collisions."""
        script = """
import {
  buildEmbeddedMediaUri,
  isLocalAudioUri,
  tryParseSpotifyUri,
} from './src/utils/domain.ts';

const realFileA = buildEmbeddedMediaUri('matchva-rd-speaker-kvinna-standard.mp3');
const realFileARepeat = buildEmbeddedMediaUri('matchva-rd-speaker-kvinna-standard.mp3');

const normVariants = [
  buildEmbeddedMediaUri('goals/horn.mp3'),
  buildEmbeddedMediaUri('./goals/horn.mp3'),
  buildEmbeddedMediaUri('/goals/horn.mp3'),
  buildEmbeddedMediaUri('goals\\\\horn.mp3'),
  buildEmbeddedMediaUri('goals//horn.mp3'),
  buildEmbeddedMediaUri('  goals/horn.mp3  '),
];

const emptyFallback = buildEmbeddedMediaUri('');
const whitespaceFallback = buildEmbeddedMediaUri('   ');

const longPrefix = 'very-long-archive-directory-name-exceeding-eighty-characters-to-verify-slug-truncation-001';
const distinctInputs = [
  'horn.mp3',
  'period1/horn.mp3',
  'period2/horn.mp3',
  'period1/sub/horn.mp3',
  'horn.wav',
  'horn.ogg',
  'horn.m4a',
  'horn.flac',
  'horn.aac',
  'horn.webm',
  'horn.opus',
  'goal_horn.mp3',
  'goal-horn.mp3',
  'goal horn.mp3',
  'målhorn.mp3',
  'malhorn.mp3',
  'hörn.wav',
  'horn_sv.wav',
  `${longPrefix}/track-alpha.mp3`,
  `${longPrefix}/track-beta.mp3`,
];

const distinctUris = distinctInputs.map((input) => buildEmbeddedMediaUri(input));
const allUris = [realFileA, emptyFallback, whitespaceFallback, ...normVariants, ...distinctUris];

console.log(JSON.stringify({
  realFileA,
  realFileARepeat,
  normVariants,
  emptyFallback,
  whitespaceFallback,
  distinctUris,
  allValidLocal: allUris.every((uri) => isLocalAudioUri(uri)),
  allStartWithMediaPrefix: allUris.every((uri) => uri.startsWith('local:audio:media-')),
  allPassTryParse: allUris.every((uri) => {
    const parsed = tryParseSpotifyUri(uri);
    return parsed.ok && parsed.uri === uri;
  }),
}));
"""
        res = run_ts_script(script)
        self.assertTrue(res["allValidLocal"])
        self.assertTrue(res["allStartWithMediaPrefix"])
        self.assertTrue(res["allPassTryParse"])

        self.assertEqual(res["realFileA"], res["realFileARepeat"])
        self.assertEqual(res["emptyFallback"], res["whitespaceFallback"])

        for variant in res["normVariants"]:
            self.assertEqual(variant, res["normVariants"][0])

        distinct_uris = res["distinctUris"]
        self.assertEqual(
            len(distinct_uris),
            len(set(distinct_uris)),
            f"URI collision detected in buildEmbeddedMediaUri: {distinct_uris}",
        )

    def test_20_normalize_jersey_and_lookup_player_name(self) -> None:
        """Verify normalizeJerseyNumber and lookupPlayerName ('#12'<->'12', '06'<->'6', '00' vs '0', '12.', 'Nr 6')."""
        script = """
import { lookupPlayerName, normalizeJerseyNumber } from './src/utils/domain.ts';

const normalized = {
  hash12: normalizeJerseyNumber('#12'),
  hashSpace12: normalizeJerseyNumber('# 12'),
  plain12: normalizeJerseyNumber('12'),
  dot12: normalizeJerseyNumber('12.'),
  nr6: normalizeJerseyNumber('Nr 6'),
  nrDot6: normalizeJerseyNumber('nr. 6'),
  no6: normalizeJerseyNumber('No. 6'),
  dash14: normalizeJerseyNumber('# 14 -'),
  zeroZero: normalizeJerseyNumber('00'),
  hashZeroZero: normalizeJerseyNumber('#00'),
  singleZero: normalizeJerseyNumber('0'),
  leadingZeroSix: normalizeJerseyNumber('06'),
  empty: normalizeJerseyNumber(''),
  whitespace: normalizeJerseyNumber('   '),
};

const rosterStandard = {
  '00': 'Oscar Holm (MV)',
  '6': 'Erik Lind',
  '12': 'Kalle Svensson',
  '22': 'Rasmus Karlsson',
};

const rosterZeroOnly = {
  '0': 'Nollan Reserv',
};

const rosterBothZeros = {
  '00': 'Oscar Holm (MV)',
  '0': 'Nollan Reserv',
};

const rosterPrefixedAndPadded = {
  '#12': 'Kalle Prefixed',
  '06': 'Erik Padded',
};

const lookups = {
  hash12OnStd: lookupPlayerName(rosterStandard, '#12'),
  dot12OnStd: lookupPlayerName(rosterStandard, '12.'),
  nr6OnStd: lookupPlayerName(rosterStandard, 'Nr 6'),
  padded06OnStd: lookupPlayerName(rosterStandard, '06'),
  hash06OnStd: lookupPlayerName(rosterStandard, '#06'),
  nr06OnStd: lookupPlayerName(rosterStandard, 'Nr 06'),
  plain12OnPrefixed: lookupPlayerName(rosterPrefixedAndPadded, '12'),
  hash12OnPrefixed: lookupPlayerName(rosterPrefixedAndPadded, '#12'),
  plain6OnPadded: lookupPlayerName(rosterPrefixedAndPadded, '6'),
  hash6OnPadded: lookupPlayerName(rosterPrefixedAndPadded, '#6'),
  nr6OnPadded: lookupPlayerName(rosterPrefixedAndPadded, 'Nr 6'),
  padded06OnPadded: lookupPlayerName(rosterPrefixedAndPadded, '06'),
  zeroZeroOnStd: lookupPlayerName(rosterStandard, '00'),
  hashZeroZeroOnStd: lookupPlayerName(rosterStandard, '#00'),
  singleZeroOnStd: lookupPlayerName(rosterStandard, '0') ?? null,
  hashSingleZeroOnStd: lookupPlayerName(rosterStandard, '#0') ?? null,
  zeroZeroOnZeroOnly: lookupPlayerName(rosterZeroOnly, '00') ?? null,
  singleZeroOnZeroOnly: lookupPlayerName(rosterZeroOnly, '0'),
  zeroZeroOnBoth: lookupPlayerName(rosterBothZeros, '00'),
  singleZeroOnBoth: lookupPlayerName(rosterBothZeros, '0'),
  missingOnStd: lookupPlayerName(rosterStandard, '99') ?? null,
  emptyOnStd: lookupPlayerName(rosterStandard, '   ') ?? null,
  undefinedRoster: lookupPlayerName(undefined, '12') ?? null,
};

console.log(JSON.stringify({ normalized, lookups }));
"""
        res = run_ts_script(script)
        n = res["normalized"]
        self.assertEqual(n["hash12"], "12")
        self.assertEqual(n["hashSpace12"], "12")
        self.assertEqual(n["plain12"], "12")
        self.assertEqual(n["dot12"], "12")
        self.assertEqual(n["nr6"], "6")
        self.assertEqual(n["nrDot6"], "6")
        self.assertEqual(n["no6"], "6")
        self.assertEqual(n["dash14"], "14")
        self.assertEqual(n["zeroZero"], "00")
        self.assertEqual(n["hashZeroZero"], "00")
        self.assertEqual(n["singleZero"], "0")
        self.assertEqual(n["leadingZeroSix"], "06")
        self.assertEqual(n["empty"], "")
        self.assertEqual(n["whitespace"], "")

        lkp = res["lookups"]
        self.assertEqual(lkp["hash12OnStd"], "Kalle Svensson")
        self.assertEqual(lkp["dot12OnStd"], "Kalle Svensson")
        self.assertEqual(lkp["nr6OnStd"], "Erik Lind")
        self.assertEqual(lkp["padded06OnStd"], "Erik Lind")
        self.assertEqual(lkp["hash06OnStd"], "Erik Lind")
        self.assertEqual(lkp["nr06OnStd"], "Erik Lind")
        self.assertEqual(lkp["plain12OnPrefixed"], "Kalle Prefixed")
        self.assertEqual(lkp["hash12OnPrefixed"], "Kalle Prefixed")
        self.assertEqual(lkp["plain6OnPadded"], "Erik Padded")
        self.assertEqual(lkp["hash6OnPadded"], "Erik Padded")
        self.assertEqual(lkp["nr6OnPadded"], "Erik Padded")
        self.assertEqual(lkp["padded06OnPadded"], "Erik Padded")
        self.assertEqual(lkp["zeroZeroOnStd"], "Oscar Holm (MV)")
        self.assertEqual(lkp["hashZeroZeroOnStd"], "Oscar Holm (MV)")
        self.assertIsNone(lkp["singleZeroOnStd"])
        self.assertIsNone(lkp["hashSingleZeroOnStd"])
        self.assertIsNone(lkp["zeroZeroOnZeroOnly"])
        self.assertEqual(lkp["singleZeroOnZeroOnly"], "Nollan Reserv")
        self.assertEqual(lkp["zeroZeroOnBoth"], "Oscar Holm (MV)")
        self.assertEqual(lkp["singleZeroOnBoth"], "Nollan Reserv")
        self.assertIsNone(lkp["missingOnStd"])
        self.assertIsNone(lkp["emptyOnStd"])
        self.assertIsNone(lkp["undefinedRoster"])

    def test_21_parse_roster_text_extended_formats(self) -> None:
        """Verify parseRosterText handles dots, Nr prefix, spaced hashes, suffix #number, and (MV) goalie suffix."""
        script = """
import { parseRosterText } from './src/utils/domain.ts';

const multiLineRoster = parseRosterText([
  '12. Kalle Svensson',
  'Nr 6 Erik Lind',
  '# 14 - Erik Svensson',
  '22 Rasmus Karlsson',
  '00 Oscar Holm (MV)',
].join('\\n'));

const suffixAndZeroRoster = parseRosterText([
  'Kalle Svensson #12',
  '0 Nollan Reserv',
  '00 Oscar Holm (MV)',
].join('\\n'));

console.log(JSON.stringify({
  multiLineRoster,
  suffixAndZeroRoster,
}));
"""
        res = run_ts_script(script)
        self.assertEqual(
            res["multiLineRoster"],
            {
                "12": "Kalle Svensson",
                "6": "Erik Lind",
                "14": "Erik Svensson",
                "22": "Rasmus Karlsson",
                "00": "Oscar Holm (MV)",
            },
        )
        self.assertEqual(
            res["suffixAndZeroRoster"],
            {
                "12": "Kalle Svensson",
                "0": "Nollan Reserv",
                "00": "Oscar Holm (MV)",
            },
        )

    def test_22_generate_scripts_roster_fallback_aliases_and_guaranteed_names(self) -> None:
        """Verify generateGoalScript and generatePenaltyScript roster fallback, alias placeholders, and guaranteed scorer name insertion."""
        script = """
import { DEFAULT_SETTINGS } from './src/data/defaults.ts';
import { generateGoalScript, generatePenaltyScript } from './src/utils/domain.ts';

const roster = {
  '00': 'Oscar Holm (MV)',
  '6': 'Erik Lind',
  '12': 'Kalle Svensson',
  '22': 'Rasmus Karlsson',
};

// 1. Roster fallback with normalized jersey numbers & '00' vs '0' distinction
const goalRosterFallback = generateGoalScript(DEFAULT_SETTINGS, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '#12',
  assists: [{ number: '06' }, { number: 'Nr 22' }],
  roster,
});

const goalZeroZeroRoster = generateGoalScript(DEFAULT_SETTINGS, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '#00',
  roster,
});

const goalSingleZeroDoesNotMatchDoubleZero = generateGoalScript(DEFAULT_SETTINGS, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '0',
  roster,
});

const penaltyRosterFallback = generatePenaltyScript(DEFAULT_SETTINGS, {
  teamName: 'Sundsvall Hockey',
  penaltyLabel: 'Tripping',
  duration: '2 minuter',
  playerNumber: 'Nr 6',
  roster,
});

const penaltyExplicitNameOverridesRoster = generatePenaltyScript(DEFAULT_SETTINGS, {
  teamName: 'Sundsvall Hockey',
  penaltyLabel: 'Tripping',
  duration: '2 minuter',
  playerNumber: '12',
  playerName: 'Annan Spelare',
  roster,
});

// 2. Alias placeholders ({name}, {playerName}, {number}, {playerNumber}, {scorerNumber}, {scorerName})
const aliasGoalSettings = {
  ...DEFAULT_SETTINGS,
  scriptTemplates: {
    ...DEFAULT_SETTINGS.scriptTemplates,
    goal: 'MÅL! {team} nr {number} {name}!',
    goalWithAssist: 'MÅL! {team} #{playerNumber} ({playerName}) - pass: {assists}.',
  },
};

const goalAliasNoAssist = generateGoalScript(aliasGoalSettings, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '12.',
  roster,
});

const goalAliasWithAssist = generateGoalScript(aliasGoalSettings, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '#12',
  assists: [{ number: '#6' }],
  roster,
});

const goalAliasUnknownSettings = {
  ...DEFAULT_SETTINGS,
  scriptTemplates: {
    ...DEFAULT_SETTINGS.scriptTemplates,
    goal: 'MÅL {team} #{number}, {playerName}!',
  },
};

const goalAliasUnknown = generateGoalScript(goalAliasUnknownSettings, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '99',
  roster,
});

const penaltyAliasSettingsA = {
  ...DEFAULT_SETTINGS,
  scriptTemplates: {
    ...DEFAULT_SETTINGS.scriptTemplates,
    penalty: 'Utvisning {team}: #{playerNumber}, {playerName}, {duration} ({reason}).',
  },
};

const penaltyAliasSettingsB = {
  ...DEFAULT_SETTINGS,
  scriptTemplates: {
    ...DEFAULT_SETTINGS.scriptTemplates,
    penalty: 'Utvisning {team}: #{scorerNumber}, {scorerName}, {duration} ({reason}).',
  },
};

const penaltyAliasPlayer = generatePenaltyScript(penaltyAliasSettingsA, {
  teamName: 'Sundsvall Hockey',
  penaltyLabel: 'Tripping',
  duration: '2 minuter',
  playerNumber: '#12',
  roster,
});

const penaltyAliasScorer = generatePenaltyScript(penaltyAliasSettingsB, {
  teamName: 'Sundsvall Hockey',
  penaltyLabel: 'Hooking',
  duration: '2 minuter',
  playerNumber: '22.',
  roster,
});

const penaltyAliasUnknown = generatePenaltyScript(penaltyAliasSettingsA, {
  teamName: 'Sundsvall Hockey',
  penaltyLabel: 'Slashing',
  duration: '2 minuter',
  playerNumber: '99',
  roster,
});

// 3. Guaranteed scorer name insertion even when goal templates omit {scorerName}/{name}/{playerName}
const missingScorerNameSettings = {
  ...DEFAULT_SETTINGS,
  scriptTemplates: {
    ...DEFAULT_SETTINGS.scriptTemplates,
    goal: 'Mål för {team}! Målskytt nummer {scorerNumber}.',
    goalWithAssist: 'Mål för {team}! Målskytt nummer {scorerNumber}. Framspelad av {assists}.',
  },
};

const goalMissingPlaceholderRosterNoAssist = generateGoalScript(missingScorerNameSettings, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '#12',
  assists: [],
  roster,
});

const goalMissingPlaceholderRosterWithAssist = generateGoalScript(missingScorerNameSettings, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '#12',
  assists: [{ number: '06' }],
  roster,
});

const goalMissingPlaceholderExplicitName = generateGoalScript(missingScorerNameSettings, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '22',
  scorerName: 'Rasmus Karlsson',
});

const goalMissingPlaceholderUnknownName = generateGoalScript(missingScorerNameSettings, {
  teamName: 'Sundsvall Hockey',
  scorerNumber: '99',
  roster,
});

console.log(JSON.stringify({
  goalRosterFallback,
  goalZeroZeroRoster,
  goalSingleZeroDoesNotMatchDoubleZero,
  penaltyRosterFallback,
  penaltyExplicitNameOverridesRoster,
  goalAliasNoAssist,
  goalAliasWithAssist,
  goalAliasUnknown,
  penaltyAliasPlayer,
  penaltyAliasScorer,
  penaltyAliasUnknown,
  goalMissingPlaceholderRosterNoAssist,
  goalMissingPlaceholderRosterWithAssist,
  goalMissingPlaceholderExplicitName,
  goalMissingPlaceholderUnknownName,
}));
"""
        res = run_ts_script(script)

        self.assertEqual(
            res["goalRosterFallback"],
            "Mål för Sundsvall Hockey! Målskytt nummer 12, Kalle Svensson. Framspelad av nummer 06 Erik Lind och nummer 22 Rasmus Karlsson.",
        )
        self.assertEqual(
            res["goalZeroZeroRoster"],
            "Mål för Sundsvall Hockey! Målskytt nummer 00, Oscar Holm (MV).",
        )
        self.assertEqual(
            res["goalSingleZeroDoesNotMatchDoubleZero"],
            "Mål för Sundsvall Hockey! Målskytt nummer 0.",
        )
        self.assertEqual(
            res["penaltyRosterFallback"],
            "Sundsvall Hockey drar på sig en utvisning genom nummer 6, Erik Lind, 2 minuter för Tripping.",
        )
        self.assertEqual(
            res["penaltyExplicitNameOverridesRoster"],
            "Sundsvall Hockey drar på sig en utvisning genom nummer 12, Annan Spelare, 2 minuter för Tripping.",
        )
        self.assertEqual(
            res["goalAliasNoAssist"],
            "MÅL! Sundsvall Hockey nr 12 Kalle Svensson!",
        )
        self.assertEqual(
            res["goalAliasWithAssist"],
            "MÅL! Sundsvall Hockey #12 (Kalle Svensson) - pass: nummer 6 Erik Lind.",
        )
        self.assertEqual(
            res["goalAliasUnknown"],
            "MÅL Sundsvall Hockey #99!",
        )
        self.assertEqual(
            res["penaltyAliasPlayer"],
            "Utvisning Sundsvall Hockey: #12, Kalle Svensson, 2 minuter (Tripping).",
        )
        self.assertEqual(
            res["penaltyAliasScorer"],
            "Utvisning Sundsvall Hockey: #22, Rasmus Karlsson, 2 minuter (Hooking).",
        )
        self.assertEqual(
            res["penaltyAliasUnknown"],
            "Utvisning Sundsvall Hockey: #99, 2 minuter (Slashing).",
        )
        self.assertEqual(
            res["goalMissingPlaceholderRosterNoAssist"],
            "Mål för Sundsvall Hockey! Målskytt nummer 12, Kalle Svensson.",
        )
        self.assertEqual(
            res["goalMissingPlaceholderRosterWithAssist"],
            "Mål för Sundsvall Hockey! Målskytt nummer 12, Kalle Svensson. Framspelad av nummer 06 Erik Lind.",
        )
        self.assertEqual(
            res["goalMissingPlaceholderExplicitName"],
            "Mål för Sundsvall Hockey! Målskytt nummer 22, Rasmus Karlsson.",
        )
        self.assertEqual(
            res["goalMissingPlaceholderUnknownName"],
            "Mål för Sundsvall Hockey! Målskytt nummer 99.",
        )

        for key, text in res.items():
            self.assertNotIn("{", text, f"Unreplaced placeholder in {key}: {text}")
            self.assertNotIn("}", text, f"Unreplaced placeholder in {key}: {text}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
