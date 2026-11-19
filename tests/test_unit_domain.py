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


if __name__ == "__main__":
    unittest.main(verbosity=2)
