import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SOUND_PADS,
  DEFAULT_TEAMS,
} from '../data/defaults.ts';
import type {
  AppSettings,
  MatchConfigSnapshot,
  SoundPad,
  Team,
  TrackCue,
} from '../types/models.ts';
import {
  exportMatchConfig,
  importMatchConfig,
  parseRosterText,
  sanitizeMatchConfig,
  selectNextTrack,
} from '../utils/domain.ts';

export const APP_STORAGE_KEY = 'hockey_dj_state_v1';

const noopMemoryStorage = new Map<string, string>();

const safeStateStorage: StateStorage = {
  getItem: (name: string): string | null => {
    if (
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined'
    ) {
      try {
        return window.localStorage.getItem(name);
      } catch {
        return null;
      }
    }
    return noopMemoryStorage.get(name) ?? null;
  },
  setItem: (name: string, value: string): void => {
    if (
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined'
    ) {
      try {
        window.localStorage.setItem(name, value);
        return;
      } catch {
        return;
      }
    }
    noopMemoryStorage.set(name, value);
  },
  removeItem: (name: string): void => {
    if (
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined'
    ) {
      try {
        window.localStorage.removeItem(name);
        return;
      } catch {
        return;
      }
    }
    noopMemoryStorage.delete(name);
  },
};

function createInitialSnapshot(): MatchConfigSnapshot {
  return sanitizeMatchConfig({
    version: 1,
    teams: DEFAULT_TEAMS,
    soundPads: DEFAULT_SOUND_PADS,
    settings: DEFAULT_SETTINGS,
  });
}

export interface AppStoreState {
  teams: {
    home: Team;
    away: Team;
  };
  soundPads: SoundPad[];
  settings: AppSettings;

  updateTeamInfo: (
    teamId: 'home' | 'away',
    updates: Partial<Pick<Team, 'name' | 'color'>>,
  ) => void;
  upsertPlayer: (
    teamId: 'home' | 'away',
    playerNumber: string,
    playerName: string,
  ) => void;
  removePlayer: (teamId: 'home' | 'away', playerNumber: string) => void;
  importRoster: (
    teamId: 'home' | 'away',
    text: string,
    mode?: 'merge' | 'replace',
  ) => number;
  clearRoster: (teamId: 'home' | 'away') => void;

  addSoundPad: (pad: Omit<SoundPad, 'id'> & { id?: string }) => string;
  updateSoundPad: (padId: string, updates: Partial<SoundPad>) => void;
  deleteSoundPad: (padId: string) => void;
  moveSoundPad: (
    padId: string,
    direction: 'up' | 'down',
    sameCategoryOnly?: boolean,
  ) => void;
  addTrackToPad: (padId: string, track: TrackCue) => void;
  updateTrackInPad: (
    padId: string,
    trackIndex: number,
    updates: Partial<TrackCue>,
  ) => void;
  removeTrackFromPad: (padId: string, trackIndex: number) => void;
  advancePadRotation: (padId: string) => TrackCue | null;

  updateSettings: (updates: Partial<AppSettings>) => void;
  updateScriptTemplates: (
    updates: Partial<AppSettings['scriptTemplates']>,
  ) => void;
  exportConfigJson: () => string;
  importConfigJson: (jsonString: string) => MatchConfigSnapshot;
  resetToDefaults: () => void;
}

const initial = createInitialSnapshot();

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      teams: initial.teams,
      soundPads: initial.soundPads,
      settings: initial.settings,

      updateTeamInfo: (teamId, updates) =>
        set((state) => ({
          teams: {
            ...state.teams,
            [teamId]: {
              ...state.teams[teamId],
              ...updates,
              id: teamId,
            },
          },
        })),

      upsertPlayer: (teamId, playerNumber, playerName) => {
        const cleanNum = playerNumber.trim();
        const cleanName = playerName.trim();
        if (!cleanNum || !cleanName) {
          return;
        }
        set((state) => ({
          teams: {
            ...state.teams,
            [teamId]: {
              ...state.teams[teamId],
              roster: {
                ...state.teams[teamId].roster,
                [cleanNum]: cleanName,
              },
            },
          },
        }));
      },

      removePlayer: (teamId, playerNumber) =>
        set((state) => {
          const nextRoster = { ...state.teams[teamId].roster };
          delete nextRoster[playerNumber];
          return {
            teams: {
              ...state.teams,
              [teamId]: {
                ...state.teams[teamId],
                roster: nextRoster,
              },
            },
          };
        }),

      importRoster: (teamId, text, mode = 'merge') => {
        const parsed = parseRosterText(text);
        const count = Object.keys(parsed).length;
        if (count === 0 && mode === 'merge') {
          return 0;
        }
        set((state) => ({
          teams: {
            ...state.teams,
            [teamId]: {
              ...state.teams[teamId],
              roster:
                mode === 'replace'
                  ? parsed
                  : { ...state.teams[teamId].roster, ...parsed },
            },
          },
        }));
        return count;
      },

      clearRoster: (teamId) =>
        set((state) => ({
          teams: {
            ...state.teams,
            [teamId]: {
              ...state.teams[teamId],
              roster: {},
            },
          },
        })),

      addSoundPad: (pad) => {
        const id =
          pad.id?.trim() ||
          `pad-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newPad: SoundPad = {
          id,
          label: pad.label.trim() || 'Ny knapp',
          category: pad.category,
          color: pad.color || '#334155',
          tracks: pad.tracks ? pad.tracks.map((t) => ({ ...t })) : [],
          lastPlayedIndex: pad.lastPlayedIndex,
          volume: pad.volume ?? 1.0,
          triggerFlow: pad.triggerFlow ?? null,
        };
        set((state) => ({
          soundPads: [...state.soundPads, newPad],
        }));
        return id;
      },

      updateSoundPad: (padId, updates) =>
        set((state) => ({
          soundPads: state.soundPads.map((pad) =>
            pad.id === padId
              ? {
                  ...pad,
                  ...updates,
                  id: pad.id,
                }
              : pad,
          ),
        })),

      deleteSoundPad: (padId) =>
        set((state) => ({
          soundPads: state.soundPads.filter((pad) => pad.id !== padId),
        })),

      moveSoundPad: (padId, direction, sameCategoryOnly = false) =>
        set((state) => {
          const pads = [...state.soundPads];
          const currentIndex = pads.findIndex((p) => p.id === padId);
          if (currentIndex === -1) {
            return state;
          }

          const currentCategory = pads[currentIndex].category;
          let targetIndex = -1;

          if (!sameCategoryOnly) {
            targetIndex =
              direction === 'up' ? currentIndex - 1 : currentIndex + 1;
          } else {
            const step = direction === 'up' ? -1 : 1;
            for (
              let idx = currentIndex + step;
              idx >= 0 && idx < pads.length;
              idx += step
            ) {
              if (pads[idx].category === currentCategory) {
                targetIndex = idx;
                break;
              }
            }
          }

          if (targetIndex < 0 || targetIndex >= pads.length) {
            return state;
          }

          const [moved] = pads.splice(currentIndex, 1);
          pads.splice(targetIndex, 0, moved);
          return { soundPads: pads };
        }),

      addTrackToPad: (padId, track) =>
        set((state) => ({
          soundPads: state.soundPads.map((pad) =>
            pad.id === padId
              ? {
                  ...pad,
                  tracks: [...pad.tracks, { ...track }],
                }
              : pad,
          ),
        })),

      updateTrackInPad: (padId, trackIndex, updates) =>
        set((state) => ({
          soundPads: state.soundPads.map((pad) => {
            if (pad.id !== padId) {
              return pad;
            }
            const nextTracks = pad.tracks.map((track, idx) =>
              idx === trackIndex ? { ...track, ...updates } : track,
            );
            return { ...pad, tracks: nextTracks };
          }),
        })),

      removeTrackFromPad: (padId, trackIndex) =>
        set((state) => ({
          soundPads: state.soundPads.map((pad) => {
            if (pad.id !== padId) {
              return pad;
            }
            const nextTracks = pad.tracks.filter(
              (_, idx) => idx !== trackIndex,
            );
            let nextLastPlayed = pad.lastPlayedIndex;
            if (nextTracks.length === 0) {
              nextLastPlayed = undefined;
            } else if (
              nextLastPlayed !== undefined &&
              nextLastPlayed >= nextTracks.length
            ) {
              nextLastPlayed = nextTracks.length - 1;
            }
            return {
              ...pad,
              tracks: nextTracks,
              lastPlayedIndex: nextLastPlayed,
            };
          }),
        })),

      advancePadRotation: (padId) => {
        const pad = get().soundPads.find((p) => p.id === padId);
        if (!pad) {
          return null;
        }
        const { track, nextIndex } = selectNextTrack(pad);
        if (!track || nextIndex < 0) {
          return null;
        }
        set((state) => ({
          soundPads: state.soundPads.map((p) =>
            p.id === padId ? { ...p, lastPlayedIndex: nextIndex } : p,
          ),
        }));
        return track;
      },

      updateSettings: (updates) =>
        set((state) => ({
          settings: {
            ...state.settings,
            ...updates,
          },
        })),

      updateScriptTemplates: (updates) =>
        set((state) => ({
          settings: {
            ...state.settings,
            scriptTemplates: {
              ...state.settings.scriptTemplates,
              ...updates,
            },
          },
        })),

      exportConfigJson: () => {
        const state = get();
        return exportMatchConfig({
          version: 1,
          teams: state.teams,
          soundPads: state.soundPads,
          settings: state.settings,
        });
      },

      importConfigJson: (jsonString) => {
        const imported = importMatchConfig(jsonString);
        set({
          teams: imported.teams,
          soundPads: imported.soundPads,
          settings: imported.settings,
        });
        return imported;
      },

      resetToDefaults: () => {
        const reset = createInitialSnapshot();
        set({
          teams: reset.teams,
          soundPads: reset.soundPads,
          settings: reset.settings,
        });
      },
    }),
    {
      name: APP_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStateStorage),
      partialize: (state) => ({
        teams: state.teams,
        soundPads: state.soundPads,
        settings: state.settings,
      }),
      merge: (persistedState, currentState) => {
        const sanitized = sanitizeMatchConfig(persistedState);
        return {
          ...currentState,
          teams: sanitized.teams,
          soundPads: sanitized.soundPads,
          settings: sanitized.settings,
        };
      },
    },
  ),
);
