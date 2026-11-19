import type {
  AppSettings,
  BuiltinPadCategory,
  KeyBindings,
  MatchActionId,
  MatchProfile,
  SavedRoster,
  SoundboardGroup,
  SoundPad,
  Team,
} from '../types/models.ts';

export const DEFAULT_SPOTIFY_CLIENT_ID = '35b681ec04634ec3a6a5083ce87216c4';

export const MATCH_ACTION_IDS: MatchActionId[] = [
  'fadeOut',
  'hardStop',
  'toggleDuck',
  'goalHome',
  'goalAway',
  'penaltyHome',
  'penaltyAway',
];

export const MATCH_ACTION_LABELS: Record<MatchActionId, string> = {
  fadeOut: 'Fade Out / Släpp puck',
  hardStop: 'Tvärstopp (Panikstopp)',
  toggleDuck: 'Ducka / Prata i mikrofon',
  goalHome: 'Mål Hemmalag',
  goalAway: 'Mål Bortalag',
  penaltyHome: 'Utvisning Hemmalag (Boxplay)',
  penaltyAway: 'Utvisning Bortalag (Powerplay)',
};

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  actions: {
    fadeOut: 'Space',
    hardStop: 'Shift+Space',
    toggleDuck: 'D',
    goalHome: 'F1',
    goalAway: 'F2',
    penaltyHome: 'F3',
    penaltyAway: 'F4',
  },
  pads: {},
};

export const EVENT_PAD_CATEGORIES: BuiltinPadCategory[] = [
  'goal_home',
  'goal_away',
  'penalty_home',
  'penalty_away',
];

export const DEFAULT_SOUNDBOARD_GROUPS: SoundboardGroup[] = [
  { id: 'faceoff_off', label: 'Tekning Anfallszon', isBuiltin: true },
  { id: 'faceoff_def', label: 'Tekning Försvarszon', isBuiltin: true },
  { id: 'hype', label: 'Pepp / Underläge', isBuiltin: true },
  { id: 'organ', label: 'Orgel / Publikpepp', isBuiltin: true },
  { id: 'misc', label: 'Timeout / Paus / Skada', isBuiltin: true },
];

export const PAD_CATEGORY_LABELS: Record<BuiltinPadCategory, string> = {
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

export const SOUNDBOARD_CATEGORIES: BuiltinPadCategory[] = [
  'faceoff_off',
  'faceoff_def',
  'hype',
  'organ',
  'misc',
];

export const ALL_PAD_CATEGORIES: BuiltinPadCategory[] = [
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

export function getPadCategoryLabel(
  categoryId: string,
  soundboardGroups?: SoundboardGroup[],
): string {
  const matchedGroup = soundboardGroups?.find(
    (group) => group.id === categoryId && group.label.trim().length > 0,
  );
  if (matchedGroup) {
    return matchedGroup.label.trim();
  }
  if (Object.prototype.hasOwnProperty.call(PAD_CATEGORY_LABELS, categoryId)) {
    return PAD_CATEGORY_LABELS[categoryId as BuiltinPadCategory];
  }
  return categoryId;
}

export const DEFAULT_TEAMS: { home: Team; away: Team } = {
  home: {
    id: 'home',
    name: 'Sundsvall Hockey',
    color: '#2563eb',
    roster: {
      '00': 'Oscar Holm (MV)',
      '1': 'Leo Lindqvist (MV)',
      '2': 'Anton Wiklund',
      '3': 'Oskar Hägg',
      '4': 'Melker Nyström',
      '6': 'Erik Lind',
      '7': 'Anna Berg',
      '9': 'Lukas Nordin',
      '10': 'Albin Söderberg',
      '11': 'Filippa Lund',
      '12': 'Kalle Svensson',
      '14': 'Erik Svensson',
      '15': 'Hannes Berglund',
      '16': 'Wilma Engman',
      '18': 'Emil Sandberg',
      '19': 'Viktor Ek',
      '20': 'Max Dahl',
      '22': 'Rasmus Karlsson',
      '23': 'Ludvig Blom',
      '25': 'Alma Åkerman',
      '27': 'Elias Norberg',
      '28': 'Nils Sjödin',
      '31': 'Hugo Sjöberg',
      '33': 'Joel Forsman',
    },
  },
  away: {
    id: 'away',
    name: 'Timrå IK',
    color: '#ea580c',
    roster: {
      '00': 'Liam Lundgren (MV)',
      '1': 'Arvid Nylander (MV)',
      '2': 'Vincent Byström',
      '3': 'Oliver Wikström',
      '5': 'Noah Forsberg',
      '6': 'Charlie Lindström',
      '8': 'Axel Holmberg',
      '9': 'Matteo Sandström',
      '11': 'Tilda Vikman',
      '12': 'Vilgot Åström',
      '15': 'Edvin Nyberg',
      '16': 'Elliot Hedin',
      '17': 'Kasper Wallin',
      '18': 'Milo Nordström',
      '20': 'Gustav Sjölund',
      '21': 'Filip Engström',
      '23': 'Linus Björk',
      '24': 'Theo Öberg',
      '25': 'Stina Holm',
      '28': 'Malte Ekman',
      '30': 'Isak Bergström (MV)',
      '33': 'Gabriel Westman',
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
  awayGoalSilence: true,
  spotifyClientId: DEFAULT_SPOTIFY_CLIENT_ID,
  spotifyRedirectUri: 'http://127.0.0.1:5173/callback',
  keyBindings: {
    actions: { ...DEFAULT_KEY_BINDINGS.actions },
    pads: { ...DEFAULT_KEY_BINDINGS.pads },
  },
  soundboardGroups: DEFAULT_SOUNDBOARD_GROUPS.map((group) => ({ ...group })),
  scriptTemplates: {
    penalty:
      '{team} drar på sig en utvisning genom nummer {number}, {name}, {duration} för {reason}.',
    penaltyTeam: 'Lagstraff för {team}, {duration} för {reason}.',
    goal: 'Mål för {team}! Målskytt nummer {scorerNumber}, {scorerName}.',
    goalWithAssist:
      'Mål för {team}! Målskytt nummer {scorerNumber}, {scorerName}. Framspelad av {assists}.',
  },
};

export const DEFAULT_SAVED_ROSTERS: SavedRoster[] = [
  {
    id: 'roster-sundsvall-u12',
    name: 'Sundsvall Hockey U12',
    teamName: 'Sundsvall Hockey',
    color: '#2563eb',
    ageGroupOrClub: 'U12',
    roster: { ...DEFAULT_TEAMS.home.roster },
    updatedAt: '2026-01-01T12:00:00.000Z',
  },
  {
    id: 'roster-timra-u12',
    name: 'Timrå IK U12',
    teamName: 'Timrå IK',
    color: '#ea580c',
    ageGroupOrClub: 'U12',
    roster: { ...DEFAULT_TEAMS.away.roster },
    updatedAt: '2026-01-01T12:00:00.000Z',
  },
  {
    id: 'roster-modo-u12',
    name: 'Modo Hockey U12',
    teamName: 'Modo Hockey',
    color: '#dc2626',
    ageGroupOrClub: 'U12',
    roster: {
      '00': 'Emil Nyström (MV)',
      '1': 'Viggo Forslund (MV)',
      '6': 'Arvid Hedlund',
      '9': 'Melvin Lind',
      '11': 'Klara Norén',
      '15': 'Sigge Holm',
      '20': 'Olle Bergman',
      '25': 'Lukas Sjölund',
      '33': 'Ture Westin',
    },
    updatedAt: '2026-01-01T12:00:00.000Z',
  },
  {
    id: 'roster-ostersund-u12',
    name: 'Östersunds IK U12',
    teamName: 'Östersunds IK',
    color: '#16a34a',
    ageGroupOrClub: 'U12',
    roster: {
      '00': 'Elias Jonsson (MV)',
      '3': 'Sixten Edlund',
      '9': 'Hjalmar Sundin',
      '14': 'Maja Viklund',
      '18': 'Love Lindberg',
      '23': 'Malte Persson',
      '29': 'Algot Åkerman',
      '35': 'Felix Nordin (MV)',
    },
    updatedAt: '2026-01-01T12:00:00.000Z',
  },
];

const JUNIOR_SOUND_PADS: SoundPad[] = [
  {
    id: 'pad-goal-home',
    label: 'Mål Hemmalag – Arena Hype',
    category: 'goal_home',
    color: '#2563eb',
    volume: 1.0,
    triggerFlow: 'goal_home',
    tracks: [
      {
        trackUri: 'spotify:track:4VqPOruhp5EdPBeR92t6lQ',
        title: 'Uprising (Goal Cut)',
        artist: 'Muse',
        startTimeMs: 36000,
      },
      {
        trackUri: 'spotify:track:0VjIjW4GlUZAMYd2vXMi3b',
        title: 'Blinding Lights (Arena)',
        artist: 'The Weeknd',
        startTimeMs: 42000,
      },
    ],
  },
  {
    id: 'pad-goal-away',
    label: 'Bortamål – Snabb Omstart',
    category: 'goal_away',
    color: '#ea580c',
    volume: 0.9,
    triggerFlow: 'goal_away',
    tracks: [
      {
        trackUri: 'spotify:track:5UWwZ5lm5PKu6eKsHAGxOk',
        title: 'Everlong (Intro Riff)',
        artist: 'Foo Fighters',
        startTimeMs: 0,
      },
    ],
  },
  {
    id: 'pad-penalty-home',
    label: 'Boxplay – Tungt Försvar',
    category: 'penalty_home',
    color: '#1d4ed8',
    volume: 1.0,
    triggerFlow: 'penalty_home',
    tracks: [
      {
        trackUri: 'spotify:track:60a0Rd6pjrkxjPbaKzXjfq',
        title: 'In the End (Intensity)',
        artist: 'Linkin Park',
        startTimeMs: 28000,
      },
    ],
  },
  {
    id: 'pad-penalty-away',
    label: 'Powerplay – Full Press!',
    category: 'penalty_away',
    color: '#dc2626',
    volume: 1.0,
    triggerFlow: 'penalty_away',
    tracks: [
      {
        trackUri: 'spotify:track:57bgtoPSgt236HzfBOd8kj',
        title: 'Thunderstruck (Powerplay)',
        artist: 'AC/DC',
        startTimeMs: 32000,
      },
    ],
  },
  {
    id: 'pad-faceoff-off-1',
    label: 'Tekning Anfall – Rock Riff',
    category: 'faceoff_off',
    color: '#0284c7',
    volume: 1.0,
    triggerFlow: null,
    tracks: [
      {
        trackUri: 'spotify:track:08mG3Y1vljYA6bvDt4Wqkj',
        title: 'Back in Black',
        artist: 'AC/DC',
        startTimeMs: 5000,
      },
      {
        trackUri: 'spotify:track:7o2CTH4ctstm8TNelqjb51',
        title: "Sweet Child O' Mine",
        artist: "Guns N' Roses",
        startTimeMs: 12000,
      },
    ],
  },
  {
    id: 'pad-faceoff-def-1',
    label: 'Tekning Försvar – Fokus',
    category: 'faceoff_def',
    color: '#4f46e5',
    volume: 1.0,
    triggerFlow: null,
    tracks: [
      {
        trackUri: 'spotify:track:2SiXAy7TuUkycRVbbWDEpo',
        title: 'You Shook Me All Night Long',
        artist: 'AC/DC',
        startTimeMs: 10000,
      },
      {
        trackUri: 'spotify:track:4pbJqGIASGPr0ZpGpnWkDn',
        title: 'We Will Rock You',
        artist: 'Queen',
        startTimeMs: 0,
      },
    ],
  },
  {
    id: 'pad-hype-1',
    label: 'Sista 2 Minuterna / Övertid',
    category: 'hype',
    color: '#059669',
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
        trackUri: 'spotify:track:003vvx7Niy0yvhvHt4a68B',
        title: 'Mr. Brightside (Arena)',
        artist: 'The Killers',
        startTimeMs: 31000,
      },
    ],
  },
  {
    id: 'pad-organ-1',
    label: 'Orgel – Publiktryck',
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
    id: 'pad-misc-timeout',
    label: 'Timeout / Videogranskning',
    category: 'misc',
    color: '#64748b',
    volume: 0.85,
    triggerFlow: null,
    tracks: [
      {
        trackUri: 'spotify:track:1AhDOtG9vPSOmsWgNW0BEY',
        title: 'Bohemian Rhapsody (Arena)',
        artist: 'Queen',
        startTimeMs: 185000,
      },
    ],
  },
];

export const DEFAULT_MATCH_PROFILES: MatchProfile[] = [
  {
    id: 'profile-u12-standard',
    name: 'U12 Ungdomshockey – Standard',
    clubOrAgeGroup: 'U12',
    soundPads: DEFAULT_SOUND_PADS.map((pad) => ({
      ...pad,
      tracks: pad.tracks.map((track) => ({ ...track })),
    })),
    teams: {
      home: {
        ...DEFAULT_TEAMS.home,
        roster: { ...DEFAULT_TEAMS.home.roster },
      },
      away: {
        ...DEFAULT_TEAMS.away,
        roster: { ...DEFAULT_TEAMS.away.roster },
      },
    },
    settings: {
      duckVolume: 0.2,
      fadeOutDurationMs: 600,
      awayGoalSilence: true,
      scriptTemplates: { ...DEFAULT_SETTINGS.scriptTemplates },
      keyBindings: {
        actions: { ...DEFAULT_KEY_BINDINGS.actions },
        pads: { ...DEFAULT_KEY_BINDINGS.pads },
      },
      soundboardGroups: DEFAULT_SOUNDBOARD_GROUPS.map((group) => ({
        ...group,
      })),
    },
    updatedAt: '2026-01-01T12:00:00.000Z',
  },
  {
    id: 'profile-junior-arena',
    name: 'Junior / A-lag – Arena Hype',
    clubOrAgeGroup: 'Junior / A-lag',
    soundPads: JUNIOR_SOUND_PADS,
    settings: {
      duckVolume: 0.15,
      fadeOutDurationMs: 450,
      awayGoalSilence: true,
      scriptTemplates: { ...DEFAULT_SETTINGS.scriptTemplates },
      keyBindings: {
        actions: { ...DEFAULT_KEY_BINDINGS.actions },
        pads: {},
      },
      soundboardGroups: DEFAULT_SOUNDBOARD_GROUPS.map((group) => ({
        ...group,
      })),
    },
    updatedAt: '2026-01-01T12:00:00.000Z',
  },
];
