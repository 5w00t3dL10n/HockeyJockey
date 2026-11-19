import type {
  AudioStateSnapshot,
  TrackCue,
} from '../types/models.ts';
import { calculateVolumeSteps } from '../utils/domain.ts';
import { spotifyPlayerService } from './spotifyPlayer.ts';

export const RAMP_INTERVAL_MS = 50;

export interface AudioTransportAdapter {
  isReady(): boolean;
  getDeviceId(): string | null;
  playTrack(trackUri: string, positionMs: number): Promise<void>;
  pause(): Promise<void>;
  setVolume(volume: number): Promise<void>;
}

const defaultSpotifyAdapter: AudioTransportAdapter = {
  isReady: () => spotifyPlayerService.isReady(),
  getDeviceId: () => spotifyPlayerService.getDeviceId(),
  playTrack: (trackUri, positionMs) =>
    spotifyPlayerService.playTrack(trackUri, positionMs),
  pause: () => spotifyPlayerService.pause(),
  setVolume: (volume) => spotifyPlayerService.setVolume(volume),
};

export type AudioStateListener = (snapshot: AudioStateSnapshot) => void;

export class AudioController {
  private readonly adapter: AudioTransportAdapter;
  private readonly listeners = new Set<AudioStateListener>();

  private state: AudioStateSnapshot = {
    mode: 'simulated',
    isPlaying: false,
    isDucked: false,
    volume: 1.0,
    positionMs: 0,
    currentTrack: null,
    deviceName: 'Hockey DJ Booth',
    deviceId: null,
    statusMessage: 'Simulerat Läge (Web Audio Fallback)',
    error: null,
  };

  private activeRampId = 0;
  private rampInterval: ReturnType<typeof setInterval> | null = null;
  private activeRampResolve: (() => void) | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private positionTimer: ReturnType<typeof setInterval> | null = null;

  private audioCtx: AudioContext | null = null;
  private simGainNode: GainNode | null = null;
  private simOscillators: OscillatorNode[] = [];

  constructor(adapter: AudioTransportAdapter = defaultSpotifyAdapter) {
    this.adapter = adapter;
  }

  public getState(): AudioStateSnapshot {
    return {
      ...this.state,
      currentTrack: this.state.currentTrack
        ? { ...this.state.currentTrack }
        : null,
    };
  }

  public subscribe(listener: AudioStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private updateState(patch: Partial<AudioStateSnapshot>): void {
    this.state = {
      ...this.state,
      ...patch,
    };
    this.emit();
  }

  public setSpotifyConnected(deviceId: string): void {
    this.stopSimulatedSynth();
    this.updateState({
      mode: 'spotify',
      deviceId,
      statusMessage: 'Spotify Ansluten (Hockey DJ Booth)',
      error: null,
    });
  }

  public setSimulatedMode(reason?: string): void {
    this.updateState({
      mode: 'simulated',
      deviceId: null,
      statusMessage: reason || 'Simulerat Läge (Web Audio Fallback)',
    });
  }

  public setError(error: string | null): void {
    this.updateState({ error });
  }

  public syncExternalPlaybackState(patch: {
    isPlaying?: boolean;
    positionMs?: number;
    currentTrack?: TrackCue | null;
  }): void {
    this.updateState(patch);
  }

  private clearActiveRamp(): void {
    this.activeRampId += 1;
    if (this.rampInterval !== null) {
      clearInterval(this.rampInterval);
      this.rampInterval = null;
    }
    if (this.activeRampResolve !== null) {
      const resolve = this.activeRampResolve;
      this.activeRampResolve = null;
      resolve();
    }
  }

  private clearPreviewTimer(): void {
    if (this.previewTimer !== null) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
  }

  private startPositionTicker(): void {
    this.stopPositionTicker();
    this.positionTimer = setInterval(() => {
      if (!this.state.isPlaying) {
        return;
      }
      this.updateState({
        positionMs: this.state.positionMs + 250,
      });
    }, 250);
  }

  private stopPositionTicker(): void {
    if (this.positionTimer !== null) {
      clearInterval(this.positionTimer);
      this.positionTimer = null;
    }
  }

  private ensureWebAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }
    const win = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioCtxCtor = win.AudioContext ?? win.webkitAudioContext;
    if (!AudioCtxCtor) {
      return null;
    }

    try {
      let ctx = this.audioCtx;
      if (!ctx) {
        ctx = new AudioCtxCtor();
        this.audioCtx = ctx;
      }
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
      return ctx;
    } catch {
      return null;
    }
  }

  private startSimulatedSynth(volume: number): void {
    if (typeof window === 'undefined') {
      return;
    }
    this.stopSimulatedSynth();
    const ctx = this.ensureWebAudioContext();
    if (!ctx) {
      return;
    }

    try {
      const gainNode = ctx.createGain();
      // Gentle audible level (max 0.08 gain) so booth preview never blasts speakers
      gainNode.gain.setValueAtTime(
        Math.min(1, Math.max(0, volume)) * 0.08,
        ctx.currentTime,
      );
      gainNode.connect(ctx.destination);

      // Soft arena organ triad (C4, E4, G4) with low-volume sine/triangle blend
      const frequencies = [261.63, 329.63, 392.0];
      const oscillators: OscillatorNode[] = [];

      for (const freq of frequencies) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.connect(gainNode);
        osc.start();
        oscillators.push(osc);
      }

      this.simGainNode = gainNode;
      this.simOscillators = oscillators;
    } catch {
      this.stopSimulatedSynth();
    }
  }

  private setSimulatedSynthVolume(volume: number): void {
    if (!this.audioCtx || !this.simGainNode) {
      return;
    }
    try {
      const clamped = Math.min(1, Math.max(0, volume));
      this.simGainNode.gain.setValueAtTime(
        clamped * 0.08,
        this.audioCtx.currentTime,
      );
    } catch {
      // Ignore Web Audio state errors
    }
  }

  private stopSimulatedSynth(): void {
    for (const osc of this.simOscillators) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Ignore already stopped oscillators
      }
    }
    this.simOscillators = [];

    if (this.simGainNode) {
      try {
        this.simGainNode.disconnect();
      } catch {
        // Ignore
      }
      this.simGainNode = null;
    }
  }

  private async applyTransportVolume(volume: number): Promise<void> {
    const clamped = Math.min(1, Math.max(0, volume));
    this.state = {
      ...this.state,
      volume: clamped,
    };
    this.emit();

    this.setSimulatedSynthVolume(clamped);
    if (this.adapter.isReady()) {
      await this.adapter.setVolume(clamped);
    }
  }

  private async runVolumeRamp(
    toVolume: number,
    durationMs: number,
    options?: {
      isDuckedOnStart?: boolean;
      isDuckedOnFinish?: boolean;
      onCompleted?: () => Promise<void> | void;
    },
  ): Promise<void> {
    this.clearActiveRamp();
    const myRampId = ++this.activeRampId;

    const steps = calculateVolumeSteps(
      this.state.volume,
      toVolume,
      durationMs,
      RAMP_INTERVAL_MS,
    );

    if (options?.isDuckedOnStart !== undefined) {
      this.updateState({ isDucked: options.isDuckedOnStart });
    }

    if (steps.length <= 1 || durationMs <= 0) {
      const finalVolume = steps[steps.length - 1] ?? Math.min(1, Math.max(0, toVolume));
      await this.applyTransportVolume(finalVolume);
      if (myRampId !== this.activeRampId) {
        return;
      }
      if (options?.isDuckedOnFinish !== undefined) {
        this.updateState({ isDucked: options.isDuckedOnFinish });
      }
      if (options?.onCompleted) {
        await options.onCompleted();
      }
      return;
    }

    await new Promise<void>((resolve) => {
      let stepIndex = 0;
      this.activeRampResolve = resolve;

      this.rampInterval = setInterval(() => {
        if (myRampId !== this.activeRampId) {
          return;
        }

        const stepValue = steps[stepIndex];
        stepIndex += 1;

        void this.applyTransportVolume(stepValue);

        if (stepIndex >= steps.length) {
          if (this.rampInterval !== null) {
            clearInterval(this.rampInterval);
            this.rampInterval = null;
          }
          this.activeRampResolve = null;

          if (options?.isDuckedOnFinish !== undefined) {
            this.updateState({ isDucked: options.isDuckedOnFinish });
          }

          if (options?.onCompleted) {
            void Promise.resolve(options.onCompleted()).finally(() => {
              resolve();
            });
          } else {
            resolve();
          }
        }
      }, RAMP_INTERVAL_MS);
    });
  }

  private async pauseTransport(): Promise<void> {
    this.stopPositionTicker();
    this.stopSimulatedSynth();
    this.updateState({
      isPlaying: false,
      isDucked: false,
    });

    if (this.adapter.isReady()) {
      await this.adapter.pause();
    }
  }

  public async playAt(
    trackUri: string,
    positionMs: number,
    targetVolume = 1.0,
    previewMs?: number,
    trackMeta?: Partial<TrackCue>,
  ): Promise<void> {
    this.clearActiveRamp();
    this.clearPreviewTimer();

    const safeVolume = Math.min(1, Math.max(0, targetVolume));
    const safePosition = Math.max(0, Math.round(positionMs));
    const track: TrackCue = {
      trackUri,
      title: trackMeta?.title?.trim() || 'Aktivt spår',
      artist: trackMeta?.artist?.trim() || '',
      startTimeMs: safePosition,
    };

    await this.applyTransportVolume(safeVolume);

    const canUseSpotify = this.adapter.isReady();
    if (canUseSpotify) {
      try {
        await this.adapter.playTrack(trackUri, safePosition);
        this.stopSimulatedSynth();
        this.updateState({
          mode: 'spotify',
          isPlaying: true,
          isDucked: false,
          positionMs: safePosition,
          currentTrack: track,
          error: null,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Kunde inte starta Spotify-uppspelning.';
        this.startSimulatedSynth(safeVolume);
        this.updateState({
          mode: 'simulated',
          isPlaying: true,
          isDucked: false,
          positionMs: safePosition,
          currentTrack: track,
          statusMessage: 'Simulerat Läge (Spotify fallback)',
          error: message,
        });
      }
    } else {
      this.startSimulatedSynth(safeVolume);
      this.updateState({
        mode: 'simulated',
        isPlaying: true,
        isDucked: false,
        positionMs: safePosition,
        currentTrack: track,
        error: null,
      });
    }

    this.startPositionTicker();

    if (
      typeof previewMs === 'number' &&
      Number.isFinite(previewMs) &&
      previewMs > 0
    ) {
      this.previewTimer = setTimeout(() => {
        this.previewTimer = null;
        void this.fadeOutAndPause();
      }, previewMs);
    }
  }

  public async duckVolume(
    targetDuckVolume = 0.2,
    durationMs = 400,
  ): Promise<void> {
    const safeTarget = Math.min(1, Math.max(0, targetDuckVolume));
    await this.runVolumeRamp(safeTarget, durationMs, {
      isDuckedOnStart: true,
      isDuckedOnFinish: true,
    });
  }

  public async restoreVolume(
    targetVolume = 1.0,
    durationMs = 400,
  ): Promise<void> {
    const safeTarget = Math.min(1, Math.max(0, targetVolume));
    await this.runVolumeRamp(safeTarget, durationMs, {
      isDuckedOnStart: false,
      isDuckedOnFinish: false,
    });
  }

  public async fadeOutAndPause(durationMs = 600): Promise<void> {
    this.clearPreviewTimer();
    await this.runVolumeRamp(0.0, durationMs, {
      onCompleted: async () => {
        await this.pauseTransport();
      },
    });
  }

  public async hardStop(): Promise<void> {
    this.clearActiveRamp();
    this.clearPreviewTimer();
    await this.pauseTransport();
  }

  public async setVolumeImmediate(volume: number): Promise<void> {
    this.clearActiveRamp();
    const safeVolume = Math.min(1, Math.max(0, volume));
    if (safeVolume > 0.35 && this.state.isDucked) {
      this.updateState({ isDucked: false });
    }
    await this.applyTransportVolume(safeVolume);
  }

  public dispose(): void {
    this.clearActiveRamp();
    this.clearPreviewTimer();
    this.stopPositionTicker();
    this.stopSimulatedSynth();
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.listeners.clear();
  }
}

export const audioController = new AudioController();
