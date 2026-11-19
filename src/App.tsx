import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { GoalFlowModal } from './components/GoalFlowModal.tsx';
import { MatchView } from './components/MatchView.tsx';
import {
  PenaltyFlowModal,
  type ModalKeyboardHandle,
} from './components/PenaltyFlowModal.tsx';
import { SetupView } from './components/SetupView.tsx';
import { TopBar } from './components/TopBar.tsx';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';
import { audioController } from './services/audioController.ts';
import {
  getStoredSpotifyAuth,
  getValidSpotifyAccessToken,
  handleSpotifyCallback,
  logoutSpotify,
  startSpotifyLogin,
} from './services/spotifyAuth.ts';
import { spotifyPlayerService } from './services/spotifyPlayer.ts';
import { useAppStore } from './store/useAppStore.ts';
import type {
  AppMode,
  AudioStateSnapshot,
  SoundPad,
  TrackCue,
} from './types/models.ts';

type ActiveModal =
  | { type: 'penalty'; teamId: 'home' | 'away' }
  | { type: 'goal'; teamId: 'home' | 'away' }
  | null;

export function App() {
  const [mode, setMode] = useState<AppMode>('match');
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [audioState, setAudioState] = useState<AudioStateSnapshot>(() =>
    audioController.getState(),
  );
  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState<boolean>(
    () => getStoredSpotifyAuth() !== null,
  );
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const teams = useAppStore((s) => s.teams);
  const soundPads = useAppStore((s) => s.soundPads);
  const settings = useAppStore((s) => s.settings);
  const advancePadRotation = useAppStore((s) => s.advancePadRotation);

  const modalRef = useRef<ModalKeyboardHandle | null>(null);
  const oauthHandledRef = useRef(false);

  const connectSpotifySdk = useCallback(async () => {
    const clientId = useAppStore.getState().settings.spotifyClientId;
    const token = await getValidSpotifyAccessToken(clientId);
    if (!token) {
      setIsSpotifyAuthenticated(false);
      audioController.setSimulatedMode();
      return;
    }

    setIsSpotifyAuthenticated(true);
    await spotifyPlayerService.connect(clientId, audioController.getState().volume);
  }, []);

  useEffect(() => {
    const unsubscribe = audioController.subscribe(setAudioState);

    spotifyPlayerService.setCallbacks({
      onReady: (deviceId) => {
        audioController.setSpotifyConnected(deviceId);
      },
      onNotReady: () => {
        audioController.setSimulatedMode(
          'Spotify-enhet frånkopplad – Simulerat Läge',
        );
      },
      onPlayerStateChanged: (playbackState) => {
        if (!playbackState) {
          return;
        }
        const current = playbackState.track_window.current_track;
        audioController.syncExternalPlaybackState({
          isPlaying: !playbackState.paused,
          positionMs: playbackState.position,
          currentTrack: current
            ? {
                trackUri: current.uri,
                title: current.name,
                artist: current.artists.map((a) => a.name).join(', '),
                startTimeMs: playbackState.position,
              }
            : undefined,
        });
      },
      onError: (msg) => {
        audioController.setError(msg);
        setBannerMessage(msg);
      },
    });

    if (typeof window !== 'undefined' && !oauthHandledRef.current) {
      oauthHandledRef.current = true;
      const searchParams = new URLSearchParams(window.location.search);
      const isCallbackPath = window.location.pathname === '/callback';
      const hasOAuthCode = searchParams.has('code') || searchParams.has('error');

      if (isCallbackPath || hasOAuthCode) {
        const currentSettings = useAppStore.getState().settings;
        void handleSpotifyCallback(
          searchParams,
          currentSettings.spotifyClientId,
          currentSettings.spotifyRedirectUri,
        )
          .then(async () => {
            setIsSpotifyAuthenticated(true);
            setBannerMessage(
              'Spotify-inloggning lyckades! Ansluter Hockey DJ Booth...',
            );
            window.history.replaceState({}, document.title, '/');
            await connectSpotifySdk();
          })
          .catch((err: unknown) => {
            const message =
              err instanceof Error
                ? err.message
                : 'Spotify-inloggning misslyckades.';
            setBannerMessage(message);
            window.history.replaceState({}, document.title, '/');
          });
      } else if (getStoredSpotifyAuth()) {
        void connectSpotifySdk();
      }
    }

    return () => {
      unsubscribe();
    };
  }, [connectSpotifySdk]);

  const playSoundPad = useCallback(
    (pad: SoundPad | undefined) => {
      if (!pad || pad.tracks.length === 0) {
        return;
      }
      const track = advancePadRotation(pad.id);
      if (!track) {
        return;
      }
      void audioController.playAt(
        track.trackUri,
        track.startTimeMs,
        pad.volume ?? 1.0,
        undefined,
        track,
      );
    },
    [advancePadRotation],
  );

  const findPadForFlow = useCallback(
    (
      flow: 'penalty_home' | 'penalty_away' | 'goal_home' | 'goal_away',
    ): SoundPad | undefined => {
      const currentPads = useAppStore.getState().soundPads;
      return (
        currentPads.find(
          (p) => p.triggerFlow === flow && p.tracks.length > 0,
        ) ??
        currentPads.find((p) => p.category === flow && p.tracks.length > 0)
      );
    },
    [],
  );

  const handleStartPenaltyMusic = useCallback(
    (teamId: 'home' | 'away') => {
      const flow = teamId === 'home' ? 'penalty_home' : 'penalty_away';
      playSoundPad(findPadForFlow(flow));
    },
    [findPadForFlow, playSoundPad],
  );

  const handleStartHomeGoalMusic = useCallback(() => {
    playSoundPad(findPadForFlow('goal_home'));
  }, [findPadForFlow, playSoundPad]);

  const handleStartAwayRestartMusic = useCallback(() => {
    const currentPads = useAppStore.getState().soundPads;
    const pad =
      findPadForFlow('goal_away') ??
      currentPads.find(
        (p) => p.category === 'faceoff_off' && p.tracks.length > 0,
      ) ??
      currentPads.find((p) => p.category === 'hype' && p.tracks.length > 0);
    playSoundPad(pad);
  }, [findPadForFlow, playSoundPad]);

  const handleFadeOut = useCallback(() => {
    void audioController.fadeOutAndPause(settings.fadeOutDurationMs);
  }, [settings.fadeOutDurationMs]);

  const handleHardStop = useCallback(() => {
    void audioController.hardStop();
  }, []);

  const handleToggleDuck = useCallback(() => {
    if (audioController.getState().isDucked) {
      void audioController.restoreVolume(1.0, 400);
    } else {
      void audioController.duckVolume(settings.duckVolume, 400);
    }
  }, [settings.duckVolume]);

  const handleConnectSpotify = useCallback(() => {
    if (!settings.spotifyClientId.trim()) {
      setMode('setup');
      setBannerMessage(
        'Ange ditt Spotify Client ID under "Spotify, Inställningar & Backup" innan du ansluter.',
      );
      return;
    }

    void startSpotifyLogin(
      settings.spotifyClientId,
      settings.spotifyRedirectUri,
    ).catch((err: unknown) => {
      setBannerMessage(
        err instanceof Error
          ? err.message
          : 'Kunde inte starta Spotify-inloggning.',
      );
    });
  }, [settings.spotifyClientId, settings.spotifyRedirectUri]);

  const handleLogoutSpotify = useCallback(() => {
    logoutSpotify();
    spotifyPlayerService.disconnect();
    setIsSpotifyAuthenticated(false);
    audioController.setSimulatedMode('Utloggad från Spotify – Simulerat Läge');
  }, []);

  const handlePreviewTrack = useCallback((track: TrackCue, volume: number) => {
    void audioController.playAt(
      track.trackUri,
      track.startTimeMs,
      volume,
      5000,
      track,
    );
  }, []);

  useKeyboardShortcuts({
    isModalOpen: activeModal !== null,
    fadeOutDurationMs: settings.fadeOutDurationMs,
    duckVolume: settings.duckVolume,
    isDucked: audioState.isDucked,
    onFadeOut: handleFadeOut,
    onHardStop: handleHardStop,
    onToggleDuck: handleToggleDuck,
    onModalDigit: (digit) => modalRef.current?.onDigit(digit),
    onModalBackspace: () => modalRef.current?.onBackspace(),
    onModalEnter: () => modalRef.current?.onEnter(),
    onModalEscape: () => modalRef.current?.onEscape(),
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <TopBar
        mode={mode}
        onChangeMode={setMode}
        audioState={audioState}
        isSpotifyAuthenticated={isSpotifyAuthenticated}
        hasSpotifyClientId={Boolean(settings.spotifyClientId.trim())}
        duckVolume={settings.duckVolume}
        onConnectSpotify={handleConnectSpotify}
        onLogoutSpotify={handleLogoutSpotify}
        onVolumeChange={(vol) => void audioController.setVolumeImmediate(vol)}
        onFadeOut={handleFadeOut}
        onHardStop={handleHardStop}
        onToggleDuck={handleToggleDuck}
      />

      {bannerMessage && (
        <div className="mx-auto mt-3 w-full max-w-[1600px] px-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-950/50 px-4 py-2.5 text-sm text-amber-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>{bannerMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              aria-label="Stäng meddelande"
              className="rounded p-1 hover:bg-amber-900/50 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">
        {mode === 'match' ? (
          <MatchView
            teams={teams}
            soundPads={soundPads}
            audioState={audioState}
            onTriggerGoal={(teamId) =>
              setActiveModal({ type: 'goal', teamId })
            }
            onTriggerPenalty={(teamId) =>
              setActiveModal({ type: 'penalty', teamId })
            }
            onTriggerSoundPad={playSoundPad}
          />
        ) : (
          <SetupView
            onPreviewTrack={handlePreviewTrack}
            onStopAudio={handleHardStop}
          />
        )}
      </main>

      {activeModal?.type === 'penalty' && (
        <PenaltyFlowModal
          ref={modalRef}
          team={teams[activeModal.teamId]}
          settings={settings}
          onStartPenaltyMusic={handleStartPenaltyMusic}
          onDuckAudio={() =>
            void audioController.duckVolume(settings.duckVolume, 400)
          }
          onRestoreAudio={() => void audioController.restoreVolume(1.0, 400)}
          onFadeOutAndClose={() => {
            void audioController.fadeOutAndPause(settings.fadeOutDurationMs);
            setActiveModal(null);
          }}
          onKeepMusicAndClose={() => {
            void audioController.restoreVolume(1.0, 400);
            setActiveModal(null);
          }}
          onCancelClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === 'goal' && (
        <GoalFlowModal
          ref={modalRef}
          team={teams[activeModal.teamId]}
          settings={settings}
          isMusicPlaying={audioState.isPlaying}
          onStartHomeGoalMusic={handleStartHomeGoalMusic}
          onStartAwayRestartMusic={handleStartAwayRestartMusic}
          onDuckAudio={() =>
            void audioController.duckVolume(settings.duckVolume, 400)
          }
          onRestoreAudio={() => void audioController.restoreVolume(1.0, 400)}
          onFadeOutAndClose={() => {
            void audioController.fadeOutAndPause(settings.fadeOutDurationMs);
            setActiveModal(null);
          }}
          onKeepMusicAndClose={() => {
            void audioController.restoreVolume(1.0, 400);
            setActiveModal(null);
          }}
          onCancelClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}

export default App;
