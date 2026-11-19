import type { AppSettings, PadCategory, SoundPad, Team } from '../types/models.ts';

export const PAD_CATEGORY_LABELS: Record<PadCategory, string> = {
  goal_home: 'Mål Hemmalag',
  goal_away: 'Mål Bortalag / Omstart',
  penalty_home: 'Utvisning Hemmalag',
  penalty_away: 'Utvisning Bortalag',
  faceoff_off: 'Tekning Anfallszon',
  faceoff_def: 'Tekning Försvarszon',
  hype: 'Pepp / Underläge',
  organ: 'Orgel / Publikpepp',
  misc: 'Timeout / Paus / Skada',
};

export const SOUNDBOARD_CATEGORIES: PadCategory[] = [
  'faceoff_off',
  'faceoff_def',
  'hype',
  'organ',
  'misc',
];

export const ALL_PAD_CATEGORIES: PadCategory[] = [
  'goal_home',
  'goal_away',
  'penalty_home',
  'penalty_away',
  'faceoff_off',
  'faceoff_def',
  'hype',
  'organ',
  'misc',
];

export const DEFAULT_TEAMS: { home: Team; away: Team } = {
  home: {
    id: 'home',
    name: 'Sundsvall Hockey',
    color: '#2563eb',
    roster: {
      '00': 'Oscar Holm (MV)',
      '1': 'Leo Lindqvist (MV)',
      '4': 'Melker Nyström',
      '7': 'Anna Berg',
      '10': 'Albin Söderberg',
      '14': 'Erik Svensson',
      '19': 'Viktor Ek',
      '22': 'Rasmus Karlsson',
      '27': 'Elias Norberg',
      '31': 'Hugo Sjöberg',
    },
  },
  away: {
    id: 'away',
    name: 'Timrå IK',
    color: '#ea580c',
    roster: {
      '00': 'Liam Lundgren (MV)',
      '5': 'Noah Forsberg',
      '8': 'Axel Holmberg',
      '12': 'Vilgot Åström',
      '17': 'Kasper Wallin',
      '21': 'Filip Engström',
      '24': 'Theo Öberg',
      '30': 'Isak Bergström (MV)',
    },
  },
};

export const DEFAULT_SOUND_PADS: SoundPad[] = [
  {
    id: 'pad-goal-home',
    label: 'Mål Hemmalag (Mållåt)',
    category: 'goal_home',
    color: '#2563eb',
    volume: 1.0,
    triggerFlow: 'goal_home',
    tracks: [
      {
        trackUri: 'spotify:track:2KH16WveTQWT6KOG9Rg6e2',
        title: 'Eye of the Tiger',
        artist: 'Survivor',
        startTimeMs: 42000,
      },
      {
        trackUri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
        title: 'Goal Horn Arena Anthem',
        artist: 'Arena Sound',
        startTimeMs: 15000,
      },
    ],
  },
  {
    id: 'pad-goal-away',
    label: 'Omstart / Pepp efter bortamål',
    category: 'goal_away',
    color: '#ea580c',
    volume: 1.0,
    triggerFlow: 'goal_away',
    tracks: [
      {
        trackUri: 'spotify:track:5CQ30WqJwcep0pYcV4AMNc',
        title: 'Jump Around (Omstart)',
        artist: 'House of Pain',
        startTimeMs: 18000,
      },
    ],
  },
  {
    id: 'pad-penalty-home',
    label: 'Boxplay – Kämpa Hemma',
    category: 'penalty_home',
    color: '#1d4ed8',
    volume: 1.0,
    triggerFlow: 'penalty_home',
    tracks: [
      {
        trackUri: 'spotify:track:3Qm86XLflmIXVm1wcwkgDK',
        title: 'Seven Nation Army',
        artist: 'The White Stripes',
        startTimeMs: 0,
      },
    ],
  },
  {
    id: 'pad-penalty-away',
    label: 'Powerplay – Nu kör vi!',
    category: 'penalty_away',
    color: '#dc2626',
    volume: 1.0,
    triggerFlow: 'penalty_away',
    tracks: [
      {
        trackUri: 'spotify:track:6habFhsOp2NvshLv26DqMb',
        title: 'Thunderstruck (Powerplay)',
        artist: 'AC/DC',
        startTimeMs: 32000,
      },
    ],
  },
  {
    id: 'pad-faceoff-off-1',
    label: 'Tekning Anfall (Pool)',
    category: 'faceoff_off',
    color: '#0284c7',
    volume: 1.0,
    triggerFlow: null,
    tracks: [
      {
        trackUri: 'spotify:track:7snQQk1zcKl8gZ92AnueZW',
        title: 'Welcome to the Jungle',
        artist: "Guns N' Roses",
        startTimeMs: 28000,
      },
      {
        trackUri: 'spotify:track:57bgtoPSgt236HzfBOd8kj',
        title: 'Thunderstruck (Riff)',
        artist: 'AC/DC',
        startTimeMs: 12000,
      },
      {
        trackUri: 'spotify:track:08mG3Y1vljYA6bvDt4Wqkj',
        title: 'Back in Black',
        artist: 'AC/DC',
        startTimeMs: 5000,
      },
    ],
  },
  {
    id: 'pad-faceoff-off-2',
    label: 'Tekning Anfall – Tryck!',
    category: 'faceoff_off',
    color: '#0ea5e9',
    volume: 1.0,
    triggerFlow: null,
    tracks: [
      {
        trackUri: 'spotify:track:2zYzyRzz6pRmhPzyfMEC8s',
        title: 'Highway to Hell',
        artist: 'AC/DC',
        startTimeMs: 20000,
      },
      {
        trackUri: 'spotify:track:3d9DChrdc6BOeFsbrZ3Is0',
        title: 'Under the Bridge Intro',
        artist: 'Arena Mix',
        startTimeMs: 45000,
      },
    ],
  },
  {
    id: 'pad-faceoff-def-1',
    label: 'Tekning Försvar (Pool)',
    category: 'faceoff_def',
    color: '#4f46e5',
    volume: 1.0,
    triggerFlow: null,
    tracks: [
      {
        trackUri: 'spotify:track:4pbJqGIASGPr0ZpGpnWkDn',
        title: 'We Will Rock You',
        artist: 'Queen',
        startTimeMs: 0,
      },
      {
        trackUri: 'spotify:track:1JSTJqkT5qHq8MDJnJbRE1',
        title: 'Every Breath You Take (Beat)',
        artist: 'The Police',
        startTimeMs: 14000,
      },
      {
        trackUri: 'spotify:track:2SiXAy7TuUkycRVbbWDEpo',
        title: 'You Shook Me All Night Long',
        artist: 'AC/DC',
        startTimeMs: 10000,
      },
    ],
  },
  {
    id: 'pad-hype-1',
    label: 'Pepp / Sista 2 minuterna',
    category: 'hype',
    color: '#059669',
    volume: 1.0,
    triggerFlow: null,
    tracks: [
      {
        trackUri: 'spotify:track:37ZJ0p5Jm13JPevGcx4SkF',
        title: "Livin' on a Prayer",
        artist: 'Bon Jovi',
        startTimeMs: 54000,
      },
      {
        trackUri: 'spotify:track:5ghIJDpPoe3CfHMGu71E6T',
        title: 'Smells Like Teen Spirit',
        artist: 'Nirvana',
        startTimeMs: 9000,
      },
    ],
  },
  {
    id: 'pad-organ-1',
    label: 'Orgel – Charge!',
    category: 'organ',
    color: '#d97706',
    volume: 1.0,
    triggerFlow: null,
    tracks: [
      {
        trackUri: 'spotify:track:1vrd6UOGamcKNGnSHJQlSt',
        title: 'Arena Organ Charge',
        artist: 'Hockey Organist',
        startTimeMs: 0,
      },
    ],
  },
  {
    id: 'pad-organ-2',
    label: 'Klapp-takt (Publikpepp)',
    category: 'organ',
    color: '#f59e0b',
    volume: 1.0,
    triggerFlow: null,
    tracks: [
      {
        trackUri: 'spotify:track:003vvx7Niy0yvhvHt4a68B',
        title: 'Mr. Brightside (Arena)',
        artist: 'The Killers',
        startTimeMs: 31000,
      },
    ],
  },
  {
    id: 'pad-misc-timeout',
    label: 'Timeout / Taktiksnack',
    category: 'misc',
    color: '#64748b',
    volume: 0.9,
    triggerFlow: null,
    tracks: [
      {
        trackUri: 'spotify:track:4u7EnebtmKWzUH433cf5Qv',
        title: 'Bohemian Rhapsody (Interlude)',
        artist: 'Queen',
        startTimeMs: 185000,
      },
    ],
  },
  {
    id: 'pad-misc-injury',
    label: 'Paus / Lugnt vid skada',
    category: 'misc',
    color: '#475569',
    volume: 0.6,
    triggerFlow: null,
    tracks: [
      {
        trackUri: 'spotify:track:7pKfPomDEeI4TPT6EOYjn9',
        title: 'Imagine (Lugn Paus)',
        artist: 'John Lennon',
        startTimeMs: 15000,
      },
    ],
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  duckVolume: 0.2,
  fadeOutDurationMs: 600,
  spotifyClientId: '',
  spotifyRedirectUri: 'http://127.0.0.1:5173/callback',
  scriptTemplates: {
    penalty:
      '{team} drar på sig en utvisning genom nummer {number}, {name}, {duration} för {reason}.',
    penaltyTeam: 'Lagstraff för {team}, {duration} för {reason}.',
    goal: 'Mål för {team}! Målskytt nummer {scorerNumber}, {scorerName}.',
    goalWithAssist:
      'Mål för {team}! Målskytt nummer {scorerNumber}, {scorerName}. Framspelad av {assists}.',
  },
};
