import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  DEFAULT_KEY_BINDINGS,
  DEFAULT_MATCH_PROFILES,
  DEFAULT_SAVED_ROSTERS,
  DEFAULT_SETTINGS,
  DEFAULT_SOUND_PADS,
  DEFAULT_TEAMS,
  EVENT_PAD_CATEGORIES,
  PAD_CATEGORY_LABELS,
} from '../data/defaults.ts';
import type {
  AppSettings,
  KeyBindings,
  MatchActionId,
  MatchConfigSnapshot,
  MatchProfile,
  SavedRoster,
  SoundboardGroup,
  SoundPad,
  Team,
  TrackCue,
} from '../types/models.ts';
import {
  registerEmbeddedMediaItems,
  type EmbeddedMediaItem,
} from '../services/localAudioStorage.ts';
import {
  assignHotkey,
  exportMatchConfig,
  importMatchConfig,
  isLocalAudioUri,
  parseRosterText,
  sanitizeKeyBindings,
  sanitizeMatchConfig,
  sanitizeSavedRoster,
  sanitizeSoundboardGroups,
  selectNextTrack,
  syncPadsWithKeyBindings,
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

const EVENT_CATEGORY_SET = new Set<string>(EVENT_PAD_CATEGORIES);

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createGroupSlug(label: string): string {
  const ascii = label
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || 'custom';
}

function cloneSoundboardGroups(groups: SoundboardGroup[]): SoundboardGroup[] {
  return groups.map((group) => ({ ...group }));
}

function cloneKeyBindings(kb: KeyBindings): KeyBindings {
  return {
    actions: { ...kb.actions },
    pads: { ...kb.pads },
  };
}

function cloneSoundPads(pads: SoundPad[]): SoundPad[] {
  return pads.map((pad) => ({
    ...pad,
    tracks: pad.tracks.map((track) => ({ ...track })),
  }));
}

function cloneTeams(teams: { home: Team; away: Team }): {
  home: Team;
  away: Team;
} {
  return {
    home: {
      ...teams.home,
      id: 'home',
      roster: { ...teams.home.roster },
    },
    away: {
      ...teams.away,
      id: 'away',
      roster: { ...teams.away.roster },
    },
  };
}

function createInitialSnapshot(): MatchConfigSnapshot {
  return sanitizeMatchConfig({
    version: 1,
    teams: DEFAULT_TEAMS,
    soundPads: DEFAULT_SOUND_PADS,
    settings: DEFAULT_SETTINGS,
    savedRosters: DEFAULT_SAVED_ROSTERS,
    matchProfiles: DEFAULT_MATCH_PROFILES,
    activeProfileId: DEFAULT_MATCH_PROFILES[0]?.id ?? null,
  });
}

export interface AppStoreState {
  teams: {
    home: Team;
    away: Team;
  };
  soundPads: SoundPad[];
  settings: AppSettings;
  savedRosters: SavedRoster[];
  matchProfiles: MatchProfile[];
  activeProfileId: string | null;
  embeddedMediaTracks: EmbeddedMediaItem[];
  autoImportedMediaUris: string[];

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

  addSoundboardGroup: (label: string, customId?: string) => string;
  updateSoundboardGroup: (groupId: string, label: string) => void;
  moveSoundboardGroup: (groupId: string, direction: 'up' | 'down') => void;
  deleteSoundboardGroup: (
    groupId: string,
    fallbackCategoryId?: string,
  ) => void;

  updateSettings: (updates: Partial<AppSettings>) => void;
  updateScriptTemplates: (
    updates: Partial<AppSettings['scriptTemplates']>,
  ) => void;

  setActionHotkey: (actionId: MatchActionId, hotkey: string) => string | null;
  setPadHotkey: (padId: string, hotkey: string) => string | null;
  resetHotkeysToDefault: () => void;

  saveTeamToRosterLibrary: (
    teamId: 'home' | 'away',
    customName?: string,
    ageGroupOrClub?: string,
    existingRosterId?: string,
  ) => string;
  loadRosterFromLibrary: (
    rosterId: string,
    targetTeamId: 'home' | 'away',
  ) => boolean;
  upsertSavedRoster: (
    roster: Omit<SavedRoster, 'id' | 'updatedAt'> & { id?: string },
  ) => string;
  deleteSavedRoster: (rosterId: string) => void;
  duplicateSavedRoster: (rosterId: string) => string | null;

  saveCurrentAsMatchProfile: (
    name: string,
    clubOrAgeGroup?: string,
    includeTeams?: boolean,
    existingProfileId?: string,
  ) => string;
  activateMatchProfile: (
    profileId: string,
    options?: { loadTeams?: boolean },
  ) => boolean;
  deleteMatchProfile: (profileId: string) => void;
  duplicateMatchProfile: (profileId: string) => string | null;

  importEmbeddedMediaArchive: (items: EmbeddedMediaItem[]) => {
    totalArchiveCount: number;
    newlyAddedCount: number;
  };

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
      savedRosters: initial.savedRosters ?? [],
      matchProfiles: initial.matchProfiles ?? [],
      activeProfileId: initial.activeProfileId ?? null,
      embeddedMediaTracks: [],
      autoImportedMediaUris: [],

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
        const id = pad.id?.trim() || generateId('pad');
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
        set((state) => {
          let nextKeyBindings = state.settings.keyBindings;
          if (pad.hotkey) {
            nextKeyBindings = assignHotkey(
              nextKeyBindings,
              { type: 'pad', id },
              pad.hotkey,
            ).keyBindings;
          }
          const nextPads = syncPadsWithKeyBindings(
            [...state.soundPads, newPad],
            nextKeyBindings,
          );
          return {
            soundPads: nextPads,
            settings: {
              ...state.settings,
              keyBindings: nextKeyBindings,
            },
          };
        });
        return id;
      },

      updateSoundPad: (padId, updates) =>
        set((state) => {
          let nextKeyBindings = state.settings.keyBindings;
          if ('hotkey' in updates) {
            nextKeyBindings = assignHotkey(
              nextKeyBindings,
              { type: 'pad', id: padId },
              updates.hotkey ?? '',
            ).keyBindings;
          }
          const updatedPads = state.soundPads.map((pad) =>
            pad.id === padId
              ? {
                  ...pad,
                  ...updates,
                  id: pad.id,
                }
              : pad,
          );
          return {
            soundPads: syncPadsWithKeyBindings(updatedPads, nextKeyBindings),
            settings: {
              ...state.settings,
              keyBindings: nextKeyBindings,
            },
          };
        }),

      deleteSoundPad: (padId) =>
        set((state) => {
          const nextPads = state.soundPads.filter((pad) => pad.id !== padId);
          const nextPadBindings = { ...state.settings.keyBindings.pads };
          delete nextPadBindings[padId];
          return {
            soundPads: nextPads,
            settings: {
              ...state.settings,
              keyBindings: {
                ...state.settings.keyBindings,
                pads: nextPadBindings,
              },
            },
          };
        }),

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

      addSoundboardGroup: (label, customId) => {
        const trimmedLabel = typeof label === 'string' ? label.trim() : '';
        const trimmedCustomId =
          typeof customId === 'string' ? customId.trim() : '';
        const currentGroups = get().settings.soundboardGroups;

        if (trimmedCustomId && !EVENT_CATEGORY_SET.has(trimmedCustomId)) {
          const existingById = currentGroups.find(
            (group) => group.id === trimmedCustomId,
          );
          if (existingById) {
            return existingById.id;
          }
        }

        if (!trimmedLabel) {
          return '';
        }

        const existingByLabel = currentGroups.find(
          (group) =>
            group.label.trim().toLowerCase() === trimmedLabel.toLowerCase(),
        );
        if (existingByLabel) {
          return existingByLabel.id;
        }

        const existingIds = new Set(currentGroups.map((group) => group.id));
        let newId =
          trimmedCustomId &&
          !EVENT_CATEGORY_SET.has(trimmedCustomId) &&
          !existingIds.has(trimmedCustomId)
            ? trimmedCustomId
            : '';

        if (!newId) {
          const slug = createGroupSlug(trimmedLabel);
          do {
            newId = `group-${slug}-${Math.random().toString(36).slice(2, 7)}`;
          } while (existingIds.has(newId) || EVENT_CATEGORY_SET.has(newId));
        }

        const newGroup: SoundboardGroup = {
          id: newId,
          label: trimmedLabel,
          isBuiltin: false,
        };

        set((state) => ({
          settings: {
            ...state.settings,
            soundboardGroups: [...state.settings.soundboardGroups, newGroup],
          },
        }));

        return newId;
      },

      updateSoundboardGroup: (groupId, label) => {
        const cleanId = typeof groupId === 'string' ? groupId.trim() : '';
        const trimmedLabel = typeof label === 'string' ? label.trim() : '';
        if (!cleanId || !trimmedLabel) {
          return;
        }
        set((state) => ({
          settings: {
            ...state.settings,
            soundboardGroups: state.settings.soundboardGroups.map((group) =>
              group.id === cleanId ? { ...group, label: trimmedLabel } : group,
            ),
          },
        }));
      },

      moveSoundboardGroup: (groupId, direction) =>
        set((state) => {
          const groups = [...state.settings.soundboardGroups];
          const currentIndex = groups.findIndex((group) => group.id === groupId);
          if (currentIndex === -1) {
            return state;
          }
          const targetIndex =
            direction === 'up' ? currentIndex - 1 : currentIndex + 1;
          if (targetIndex < 0 || targetIndex >= groups.length) {
            return state;
          }
          const [moved] = groups.splice(currentIndex, 1);
          groups.splice(targetIndex, 0, moved);
          return {
            settings: {
              ...state.settings,
              soundboardGroups: groups,
            },
          };
        }),

      deleteSoundboardGroup: (groupId, fallbackCategoryId) =>
        set((state) => {
          const cleanId = typeof groupId === 'string' ? groupId.trim() : '';
          if (!cleanId) {
            return state;
          }
          let remainingGroups = state.settings.soundboardGroups.filter(
            (group) => group.id !== cleanId,
          );
          if (remainingGroups.length === 0) {
            remainingGroups = [
              {
                id: 'misc',
                label: PAD_CATEGORY_LABELS.misc,
                isBuiltin: true,
              },
            ];
          }

          const cleanFallback =
            typeof fallbackCategoryId === 'string'
              ? fallbackCategoryId.trim()
              : '';
          const isValidFallback =
            cleanFallback.length > 0 &&
            cleanFallback !== cleanId &&
            (remainingGroups.some((group) => group.id === cleanFallback) ||
              EVENT_CATEGORY_SET.has(cleanFallback));

          const targetCategory = isValidFallback
            ? cleanFallback
            : (remainingGroups[0]?.id ?? 'misc');

          const nextPads = state.soundPads.map((pad) =>
            pad.category === cleanId
              ? { ...pad, category: targetCategory }
              : pad,
          );

          return {
            soundPads: nextPads,
            settings: {
              ...state.settings,
              soundboardGroups: remainingGroups,
            },
          };
        }),

      updateSettings: (updates) =>
        set((state) => {
          const validPadIds = new Set(state.soundPads.map((p) => p.id));
          const nextKeyBindings = updates.keyBindings
            ? sanitizeKeyBindings(
                updates.keyBindings,
                DEFAULT_KEY_BINDINGS,
                validPadIds,
              )
            : state.settings.keyBindings;
          const nextSoundboardGroups =
            updates.soundboardGroups !== undefined
              ? sanitizeSoundboardGroups(
                  updates.soundboardGroups,
                  state.settings.soundboardGroups,
                  state.soundPads,
                )
              : state.settings.soundboardGroups;
          const nextSettings: AppSettings = {
            ...state.settings,
            ...updates,
            keyBindings: nextKeyBindings,
            soundboardGroups: nextSoundboardGroups,
          };
          return {
            settings: nextSettings,
            soundPads: updates.keyBindings
              ? syncPadsWithKeyBindings(state.soundPads, nextKeyBindings)
              : state.soundPads,
          };
        }),

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

      setActionHotkey: (actionId, hotkey) => {
        const current = get().settings.keyBindings;
        const { keyBindings, replacedTarget } = assignHotkey(
          current,
          { type: 'action', id: actionId },
          hotkey,
        );
        set((state) => ({
          settings: {
            ...state.settings,
            keyBindings,
          },
          soundPads: syncPadsWithKeyBindings(state.soundPads, keyBindings),
        }));
        return replacedTarget;
      },

      setPadHotkey: (padId, hotkey) => {
        const cleanPadId = padId.trim();
        if (!cleanPadId) {
          return null;
        }
        const current = get().settings.keyBindings;
        const { keyBindings, replacedTarget } = assignHotkey(
          current,
          { type: 'pad', id: cleanPadId },
          hotkey,
        );
        set((state) => ({
          settings: {
            ...state.settings,
            keyBindings,
          },
          soundPads: syncPadsWithKeyBindings(state.soundPads, keyBindings),
        }));
        return replacedTarget;
      },

      resetHotkeysToDefault: () =>
        set((state) => {
          const nextBindings = cloneKeyBindings(DEFAULT_KEY_BINDINGS);
          return {
            settings: {
              ...state.settings,
              keyBindings: nextBindings,
            },
            soundPads: syncPadsWithKeyBindings(state.soundPads, nextBindings),
          };
        }),

      saveTeamToRosterLibrary: (
        teamId,
        customName,
        ageGroupOrClub,
        existingRosterId,
      ) => {
        const state = get();
        const team = state.teams[teamId];
        const now = new Date().toISOString();
        const trimmedCustomName = customName?.trim();
        const trimmedAge = ageGroupOrClub?.trim();
        const targetId = existingRosterId?.trim();

        const existing = targetId
          ? state.savedRosters.find((r) => r.id === targetId)
          : undefined;

        if (existing) {
          const updated: SavedRoster = {
            ...existing,
            name: trimmedCustomName || existing.name,
            teamName: team.name,
            color: team.color,
            ...(ageGroupOrClub !== undefined
              ? trimmedAge
                ? { ageGroupOrClub: trimmedAge }
                : {}
              : existing.ageGroupOrClub
                ? { ageGroupOrClub: existing.ageGroupOrClub }
                : {}),
            roster: { ...team.roster },
            updatedAt: now,
          };
          set((prev) => ({
            savedRosters: prev.savedRosters.map((r) =>
              r.id === existing.id ? updated : r,
            ),
          }));
          return existing.id;
        }

        const newId = targetId || generateId('roster');
        const defaultName = trimmedAge
          ? `${team.name} (${trimmedAge})`
          : team.name;
        const created: SavedRoster = {
          id: newId,
          name: trimmedCustomName || defaultName,
          teamName: team.name,
          color: team.color,
          ...(trimmedAge ? { ageGroupOrClub: trimmedAge } : {}),
          roster: { ...team.roster },
          updatedAt: now,
        };
        set((prev) => ({
          savedRosters: [...prev.savedRosters, created],
        }));
        return newId;
      },

      loadRosterFromLibrary: (rosterId, targetTeamId) => {
        const saved = get().savedRosters.find((r) => r.id === rosterId);
        if (!saved) {
          return false;
        }
        set((state) => ({
          teams: {
            ...state.teams,
            [targetTeamId]: {
              id: targetTeamId,
              name: saved.teamName,
              color: saved.color,
              roster: { ...saved.roster },
            },
          },
        }));
        return true;
      },

      upsertSavedRoster: (rosterInput) => {
        const state = get();
        const now = new Date().toISOString();
        const cleanId = rosterInput.id?.trim();
        const existingIndex = cleanId
          ? state.savedRosters.findIndex((r) => r.id === cleanId)
          : -1;
        const finalId =
          existingIndex >= 0 && cleanId ? cleanId : cleanId || generateId('roster');

        const sanitized = sanitizeSavedRoster({
          ...rosterInput,
          id: finalId,
          updatedAt: now,
        });
        if (!sanitized) {
          return finalId;
        }

        if (existingIndex >= 0) {
          set((prev) => ({
            savedRosters: prev.savedRosters.map((r) =>
              r.id === finalId ? sanitized : r,
            ),
          }));
        } else {
          set((prev) => ({
            savedRosters: [...prev.savedRosters, sanitized],
          }));
        }
        return finalId;
      },

      deleteSavedRoster: (rosterId) =>
        set((state) => ({
          savedRosters: state.savedRosters.filter((r) => r.id !== rosterId),
        })),

      duplicateSavedRoster: (rosterId) => {
        const state = get();
        const source = state.savedRosters.find((r) => r.id === rosterId);
        if (!source) {
          return null;
        }
        const newId = generateId('roster');
        const copy: SavedRoster = {
          ...source,
          id: newId,
          name: `${source.name} (kopia)`,
          roster: { ...source.roster },
          updatedAt: new Date().toISOString(),
        };
        set((prev) => {
          const idx = prev.savedRosters.findIndex((r) => r.id === rosterId);
          const next = [...prev.savedRosters];
          if (idx >= 0) {
            next.splice(idx + 1, 0, copy);
          } else {
            next.push(copy);
          }
          return { savedRosters: next };
        });
        return newId;
      },

      saveCurrentAsMatchProfile: (
        name,
        clubOrAgeGroup,
        includeTeams = false,
        existingProfileId,
      ) => {
        const state = get();
        const now = new Date().toISOString();
        const trimmedName = name.trim();
        const trimmedClub = clubOrAgeGroup?.trim();
        const targetId = existingProfileId?.trim();
        const existing = targetId
          ? state.matchProfiles.find((p) => p.id === targetId)
          : undefined;

        const finalId = existing ? existing.id : targetId || generateId('profile');
        const clonedBindings = cloneKeyBindings(state.settings.keyBindings);
        const clonedGroups = cloneSoundboardGroups(
          state.settings.soundboardGroups,
        );
        const clonedPads = syncPadsWithKeyBindings(
          cloneSoundPads(state.soundPads),
          clonedBindings,
        );

        const nextProfile: MatchProfile = {
          id: finalId,
          name: trimmedName || existing?.name || 'Ny Matchprofil',
          ...(clubOrAgeGroup !== undefined
            ? trimmedClub
              ? { clubOrAgeGroup: trimmedClub }
              : {}
            : existing?.clubOrAgeGroup
              ? { clubOrAgeGroup: existing.clubOrAgeGroup }
              : {}),
          soundPads: clonedPads,
          ...(includeTeams ? { teams: cloneTeams(state.teams) } : {}),
          settings: {
            duckVolume: state.settings.duckVolume,
            fadeOutDurationMs: state.settings.fadeOutDurationMs,
            awayGoalSilence: state.settings.awayGoalSilence,
            scriptTemplates: { ...state.settings.scriptTemplates },
            keyBindings: clonedBindings,
            soundboardGroups: clonedGroups,
          },
          updatedAt: now,
        };

        set((prev) => ({
          matchProfiles: existing
            ? prev.matchProfiles.map((p) =>
                p.id === existing.id ? nextProfile : p,
              )
            : [...prev.matchProfiles, nextProfile],
          activeProfileId: finalId,
        }));

        return finalId;
      },

      activateMatchProfile: (profileId, options) => {
        const state = get();
        const profile = state.matchProfiles.find((p) => p.id === profileId);
        if (!profile) {
          return false;
        }

        const rawPads = cloneSoundPads(profile.soundPads);
        const validPadIds = new Set(rawPads.map((p) => p.id));

        const nextKeyBindings = profile.settings?.keyBindings
          ? sanitizeKeyBindings(
              profile.settings.keyBindings,
              DEFAULT_KEY_BINDINGS,
              validPadIds,
            )
          : sanitizeKeyBindings(
              state.settings.keyBindings,
              DEFAULT_KEY_BINDINGS,
              validPadIds,
            );

        const nextPads = syncPadsWithKeyBindings(rawPads, nextKeyBindings);
        const nextSoundboardGroups = sanitizeSoundboardGroups(
          profile.settings?.soundboardGroups,
          state.settings.soundboardGroups,
          nextPads,
        );

        const nextSettings: AppSettings = {
          ...state.settings,
          duckVolume: profile.settings?.duckVolume ?? state.settings.duckVolume,
          fadeOutDurationMs:
            profile.settings?.fadeOutDurationMs ??
            state.settings.fadeOutDurationMs,
          awayGoalSilence:
            typeof profile.settings?.awayGoalSilence === 'boolean'
              ? profile.settings.awayGoalSilence
              : state.settings.awayGoalSilence,
          scriptTemplates: profile.settings?.scriptTemplates
            ? { ...profile.settings.scriptTemplates }
            : { ...state.settings.scriptTemplates },
          keyBindings: nextKeyBindings,
          soundboardGroups: nextSoundboardGroups,
        };

        const shouldLoadTeams = Boolean(options?.loadTeams && profile.teams);

        set((prev) => ({
          soundPads: nextPads,
          settings: nextSettings,
          teams:
            shouldLoadTeams && profile.teams
              ? cloneTeams(profile.teams)
              : prev.teams,
          activeProfileId: profile.id,
        }));

        return true;
      },

      deleteMatchProfile: (profileId) =>
        set((state) => ({
          matchProfiles: state.matchProfiles.filter((p) => p.id !== profileId),
          activeProfileId:
            state.activeProfileId === profileId ? null : state.activeProfileId,
        })),

      duplicateMatchProfile: (profileId) => {
        const state = get();
        const source = state.matchProfiles.find((p) => p.id === profileId);
        if (!source) {
          return null;
        }
        const newId = generateId('profile');
        const copy: MatchProfile = {
          ...source,
          id: newId,
          name: `${source.name} (kopia)`,
          soundPads: cloneSoundPads(source.soundPads),
          ...(source.teams ? { teams: cloneTeams(source.teams) } : {}),
          ...(source.settings
            ? {
                settings: {
                  ...source.settings,
                  ...(source.settings.scriptTemplates
                    ? { scriptTemplates: { ...source.settings.scriptTemplates } }
                    : {}),
                  ...(source.settings.keyBindings
                    ? {
                        keyBindings: cloneKeyBindings(
                          source.settings.keyBindings,
                        ),
                      }
                    : {}),
                  ...(source.settings.soundboardGroups
                    ? {
                        soundboardGroups: cloneSoundboardGroups(
                          source.settings.soundboardGroups,
                        ),
                      }
                    : {}),
                },
              }
            : {}),
          updatedAt: new Date().toISOString(),
        };
        set((prev) => {
          const idx = prev.matchProfiles.findIndex((p) => p.id === profileId);
          const next = [...prev.matchProfiles];
          if (idx >= 0) {
            next.splice(idx + 1, 0, copy);
          } else {
            next.push(copy);
          }
          return { matchProfiles: next };
        });
        return newId;
      },

      importEmbeddedMediaArchive: (items) => {
        const safeItems = Array.isArray(items)
          ? items
              .filter(
                (item): item is EmbeddedMediaItem =>
                  Boolean(item) &&
                  typeof item.trackUri === 'string' &&
                  isLocalAudioUri(item.trackUri) &&
                  typeof item.fileName === 'string' &&
                  Boolean(item.fileName.trim()) &&
                  typeof item.streamUrl === 'string' &&
                  Boolean(item.streamUrl.trim()),
              )
              .map((item) => ({ ...item }))
          : [];

        if (safeItems.length > 0) {
          registerEmbeddedMediaItems(safeItems);
        }

        if (safeItems.length === 0) {
          set({ embeddedMediaTracks: [] });
          return { totalArchiveCount: 0, newlyAddedCount: 0 };
        }

        let newlyAddedCount = 0;

        set((state) => {
          const itemByUri = new Map<string, EmbeddedMediaItem>();
          const itemByFileName = new Map<string, EmbeddedMediaItem>();
          for (const item of safeItems) {
            itemByUri.set(item.trackUri, item);
            if (!itemByFileName.has(item.fileName)) {
              itemByFileName.set(item.fileName, item);
            }
          }

          const nextPads = state.soundPads.map((pad) => {
            let tracksChanged = false;
            const updatedTracks = pad.tracks.map((track) => {
              const matched =
                itemByUri.get(track.trackUri) ??
                (track.localFileName
                  ? itemByFileName.get(track.localFileName)
                  : undefined);
              if (!matched) {
                return track;
              }
              if (
                track.sourceType === 'local' &&
                track.localFileName === matched.fileName &&
                track.mimeType === matched.mimeType
              ) {
                return track;
              }
              tracksChanged = true;
              return {
                ...track,
                sourceType: 'local' as const,
                localFileName: matched.fileName,
                mimeType: matched.mimeType,
              };
            });
            return tracksChanged ? { ...pad, tracks: updatedTracks } : pad;
          });

          const autoImportedSet = new Set(state.autoImportedMediaUris);
          const existingPadTrackUris = new Set<string>();
          const usedPadIds = new Set<string>();
          for (const pad of nextPads) {
            usedPadIds.add(pad.id);
            for (const track of pad.tracks) {
              existingPadTrackUris.add(track.trackUri);
            }
          }

          const addedPads: SoundPad[] = [];
          const nextAutoImportedUris = [...state.autoImportedMediaUris];

          for (const item of safeItems) {
            if (
              autoImportedSet.has(item.trackUri) ||
              existingPadTrackUris.has(item.trackUri)
            ) {
              continue;
            }

            const uriSuffix = item.trackUri.startsWith('local:audio:')
              ? item.trackUri.slice('local:audio:'.length)
              : createGroupSlug(item.relativePath || item.fileName);
            let padId = `pad-media-${uriSuffix}`;
            while (usedPadIds.has(padId)) {
              padId = `pad-media-${uriSuffix}-${Math.random().toString(36).slice(2, 6)}`;
            }
            usedPadIds.add(padId);

            addedPads.push({
              id: padId,
              label: item.title || item.fileName,
              category: 'media_archive',
              color: '#0891b2',
              volume: 1.0,
              triggerFlow: null,
              tracks: [
                {
                  trackUri: item.trackUri,
                  title: item.title || item.fileName,
                  artist: item.artist ?? '',
                  startTimeMs: 0,
                  sourceType: 'local',
                  localFileName: item.fileName,
                  mimeType: item.mimeType,
                },
              ],
            });

            autoImportedSet.add(item.trackUri);
            nextAutoImportedUris.push(item.trackUri);
            existingPadTrackUris.add(item.trackUri);
            newlyAddedCount += 1;
          }

          let nextGroups = state.settings.soundboardGroups;
          if (
            newlyAddedCount > 0 &&
            !nextGroups.some((group) => group.id === 'media_archive')
          ) {
            nextGroups = [
              ...nextGroups,
              {
                id: 'media_archive',
                label: 'Inbäddat Mediaarkiv',
                isBuiltin: false,
              },
            ];
          }

          return {
            embeddedMediaTracks: safeItems,
            autoImportedMediaUris: nextAutoImportedUris,
            soundPads:
              addedPads.length > 0 ? [...nextPads, ...addedPads] : nextPads,
            settings:
              nextGroups !== state.settings.soundboardGroups
                ? {
                    ...state.settings,
                    soundboardGroups: nextGroups,
                  }
                : state.settings,
          };
        });

        return {
          totalArchiveCount: safeItems.length,
          newlyAddedCount,
        };
      },

      exportConfigJson: () => {
        const state = get();
        return exportMatchConfig({
          version: 1,
          teams: state.teams,
          soundPads: state.soundPads,
          settings: state.settings,
          savedRosters: state.savedRosters,
          matchProfiles: state.matchProfiles,
          activeProfileId: state.activeProfileId,
        });
      },

      importConfigJson: (jsonString) => {
        const imported = importMatchConfig(jsonString);
        set({
          teams: imported.teams,
          soundPads: imported.soundPads,
          settings: imported.settings,
          savedRosters: imported.savedRosters ?? [],
          matchProfiles: imported.matchProfiles ?? [],
          activeProfileId: imported.activeProfileId ?? null,
        });
        return imported;
      },

      resetToDefaults: () => {
        const reset = createInitialSnapshot();
        set({
          teams: reset.teams,
          soundPads: reset.soundPads,
          settings: reset.settings,
          savedRosters: reset.savedRosters ?? [],
          matchProfiles: reset.matchProfiles ?? [],
          activeProfileId: reset.activeProfileId ?? null,
          autoImportedMediaUris: [],
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
        savedRosters: state.savedRosters,
        matchProfiles: state.matchProfiles,
        activeProfileId: state.activeProfileId,
        autoImportedMediaUris: state.autoImportedMediaUris,
      }),
      merge: (persistedState, currentState) => {
        const sanitized = sanitizeMatchConfig(persistedState);
        const rawPersisted =
          typeof persistedState === 'object' && persistedState !== null
            ? (persistedState as Record<string, unknown>)
            : {};
        const rawAutoUris = Array.isArray(rawPersisted.autoImportedMediaUris)
          ? Array.from(
              new Set(
                rawPersisted.autoImportedMediaUris.filter(
                  (uri): uri is string =>
                    typeof uri === 'string' && isLocalAudioUri(uri),
                ),
              ),
            )
          : [];
        return {
          ...currentState,
          teams: sanitized.teams,
          soundPads: sanitized.soundPads,
          settings: sanitized.settings,
          savedRosters: sanitized.savedRosters ?? [],
          matchProfiles: sanitized.matchProfiles ?? [],
          activeProfileId: sanitized.activeProfileId ?? null,
          autoImportedMediaUris: rawAutoUris,
        };
      },
    },
  ),
);
