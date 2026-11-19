import type {
  AppSettings,
  AudioStateSnapshot,
  PiperVoiceId,
  TtsEngineType,
  TtsStatusResponse,
} from '../types/models.ts';
import { isValidPiperVoiceId } from '../utils/domain.ts';
import { audioController } from './audioController.ts';

export type TtsPlaybackState = 'idle' | 'loading' | 'speaking' | 'error';

export interface TtsServiceState {
  playbackState: TtsPlaybackState;
  activeEngine: TtsEngineType | null;
  activeVoiceId: PiperVoiceId | null;
  usedFallback: boolean;
  lastError: string | null;
  piperStatus: TtsStatusResponse | null;
}

export type TtsStateListener = (state: TtsServiceState) => void;

export interface AudioDuckingAdapter {
  getState(): Pick<AudioStateSnapshot, 'isPlaying' | 'volume'>;
  duckVolume(targetDuckVolume?: number, durationMs?: number): Promise<void>;
  restoreVolume(targetVolume?: number, durationMs?: number): Promise<void>;
}

export interface TtsFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type TtsFetchFn = (
  input: string,
  init?: RequestInit,
) => Promise<TtsFetchResponse>;

export interface TtsAudioPlayer {
  playWav(
    audioBuffer: ArrayBuffer,
    options: {
      volume: number;
      signal?: AbortSignal;
    },
  ): Promise<void>;
  stop?(): void;
}

export interface TtsSpeechRequest {
  text: string;
  lang: string;
  rate: number;
  volume: number;
  signal?: AbortSignal;
}

export interface TtsSpeechSynthesizer {
  isSupported(): boolean;
  speak(request: TtsSpeechRequest): Promise<void>;
  cancel(): void;
}

export interface TtsDependencies {
  fetch?: TtsFetchFn;
  transport?: { fetch: TtsFetchFn };
  audioPlayer?: TtsAudioPlayer;
  speechSynthesizer?: TtsSpeechSynthesizer;
}

const defaultFetch: TtsFetchFn = (input, init) => {
  if (typeof globalThis.fetch !== 'function') {
    return Promise.reject(new Error('Fetch API saknas i denna miljö.'));
  }
  return globalThis.fetch(input, init);
};

class BrowserTtsAudioPlayer implements TtsAudioPlayer {
  private activeAudio: HTMLAudioElement | null = null;
  private activeObjectUrl: string | null = null;
  private activeAbortHandler: (() => void) | null = null;

  public stop(): void {
    const abortHandler = this.activeAbortHandler;
    this.activeAbortHandler = null;
    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.removeAttribute('src');
        this.activeAudio.load();
      } catch {
        // Ignore HTMLAudioElement cleanup errors
      }
      this.activeAudio = null;
    }
    if (this.activeObjectUrl && typeof URL !== 'undefined') {
      try {
        URL.revokeObjectURL(this.activeObjectUrl);
      } catch {
        // Ignore URL revoke errors
      }
      this.activeObjectUrl = null;
    }
    abortHandler?.();
  }

  public playWav(
    audioBuffer: ArrayBuffer,
    options: { volume: number; signal?: AbortSignal },
  ): Promise<void> {
    this.stop();

    if (options.signal?.aborted) {
      return Promise.resolve();
    }

    if (
      typeof Audio === 'undefined' ||
      typeof Blob === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return Promise.reject(
        new Error('Webbläsarens ljuduppspelning stöds inte i denna miljö.'),
      );
    }

    return new Promise<void>((resolve, reject) => {
      const blob = new Blob([audioBuffer], { type: 'audio/wav' });
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audio.volume = Math.min(1, Math.max(0, options.volume));

      this.activeAudio = audio;
      this.activeObjectUrl = objectUrl;

      let settled = false;

      const cleanup = () => {
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        options.signal?.removeEventListener('abort', onAbort);
        if (this.activeAudio === audio) {
          try {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
          } catch {
            // Ignore cleanup errors
          }
          this.activeAudio = null;
        }
        if (this.activeObjectUrl === objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {
            // Ignore revoke errors
          }
          this.activeObjectUrl = null;
        }
        if (this.activeAbortHandler === onAbort) {
          this.activeAbortHandler = null;
        }
      };

      const onEnded = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Kunde inte spela upp syntetiserat tal från Piper TTS.'));
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      this.activeAbortHandler = onAbort;
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      options.signal?.addEventListener('abort', onAbort, { once: true });

      void audio.play().catch((err: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (options.signal?.aborted) {
          resolve();
        } else {
          reject(
            err instanceof Error
              ? err
              : new Error('Uppspelning av TTS-ljud blockerades av webbläsaren.'),
          );
        }
      });
    });
  }
}

class BrowserSpeechSynthesizer implements TtsSpeechSynthesizer {
  private activeAbortHandler: (() => void) | null = null;

  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof window.speechSynthesis !== 'undefined' &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    );
  }

  public cancel(): void {
    const abortHandler = this.activeAbortHandler;
    this.activeAbortHandler = null;
    if (this.isSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore speechSynthesis cancel errors
      }
    }
    abortHandler?.();
  }

  public speak(request: TtsSpeechRequest): Promise<void> {
    if (!this.isSupported()) {
      return Promise.reject(
        new Error('Web Speech API stöds inte i denna webbläsare.'),
      );
    }

    if (request.signal?.aborted) {
      return Promise.resolve();
    }

    this.cancel();

    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(request.text);
      utterance.lang = request.lang || 'sv-SE';
      utterance.rate = Math.min(2.0, Math.max(0.5, request.rate));
      utterance.volume = Math.min(1.0, Math.max(0.0, request.volume));

      try {
        const voices = window.speechSynthesis.getVoices();
        const swedishVoice =
          voices.find((voice) => voice.lang.toLowerCase() === 'sv-se') ??
          voices.find((voice) => voice.lang.toLowerCase().startsWith('sv'));
        if (swedishVoice) {
          utterance.voice = swedishVoice;
        }
      } catch {
        // Ignore voice lookup failures
      }

      let settled = false;

      const cleanup = () => {
        utterance.onend = null;
        utterance.onerror = null;
        request.signal?.removeEventListener('abort', onAbort);
        if (this.activeAbortHandler === onAbort) {
          this.activeAbortHandler = null;
        }
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
        resolve();
      };

      utterance.onend = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      utterance.onerror = (event) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (
          request.signal?.aborted ||
          event.error === 'canceled' ||
          event.error === 'interrupted'
        ) {
          resolve();
        } else {
          reject(
            new Error(`Web Speech-fel: ${event.error || 'okänt fel'}.`),
          );
        }
      };

      this.activeAbortHandler = onAbort;
      request.signal?.addEventListener('abort', onAbort, { once: true });

      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        if (!settled) {
          settled = true;
          cleanup();
          reject(
            err instanceof Error
              ? err
              : new Error('Kunde inte starta Web Speech API.'),
          );
        }
      }
    });
  }
}

function cloneStatusResponse(
  status: TtsStatusResponse | null,
): TtsStatusResponse | null {
  if (!status) {
    return null;
  }
  return {
    available: status.available,
    engine: status.engine,
    voices: status.voices.map((voice) => ({ ...voice })),
  };
}

function isValidStatusResponse(payload: unknown): payload is TtsStatusResponse {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const obj = payload as Record<string, unknown>;
  return (
    typeof obj.available === 'boolean' &&
    obj.engine === 'piper' &&
    Array.isArray(obj.voices)
  );
}

export class TtsService {
  private readonly fetchFn: TtsFetchFn;
  private readonly audioPlayer: TtsAudioPlayer;
  private readonly speechSynthesizer: TtsSpeechSynthesizer;
  private readonly listeners = new Set<TtsStateListener>();

  private speakSeq = 0;
  private activeAbortController: AbortController | null = null;

  private state: TtsServiceState = {
    playbackState: 'idle',
    activeEngine: null,
    activeVoiceId: null,
    usedFallback: false,
    lastError: null,
    piperStatus: null,
  };

  constructor(deps: TtsDependencies = {}) {
    this.fetchFn = deps.fetch ?? deps.transport?.fetch ?? defaultFetch;
    this.audioPlayer = deps.audioPlayer ?? new BrowserTtsAudioPlayer();
    this.speechSynthesizer =
      deps.speechSynthesizer ?? new BrowserSpeechSynthesizer();
  }

  public getState(): TtsServiceState {
    return {
      ...this.state,
      piperStatus: cloneStatusResponse(this.state.piperStatus),
    };
  }

  public subscribe(listener: TtsStateListener): () => void {
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

  private updateState(patch: Partial<TtsServiceState>): void {
    this.state = {
      ...this.state,
      ...patch,
    };
    this.emit();
  }

  public async checkStatus(): Promise<TtsStatusResponse | null> {
    try {
      const response = await this.fetchFn('/api/tts/status', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        this.updateState({ piperStatus: null });
        return null;
      }
      const data = await response.json();
      if (!isValidStatusResponse(data)) {
        this.updateState({ piperStatus: null });
        return null;
      }
      const cloned = cloneStatusResponse(data);
      this.updateState({ piperStatus: cloned });
      return cloneStatusResponse(cloned);
    } catch {
      this.updateState({ piperStatus: null });
      return null;
    }
  }

  public stop(): void {
    this.speakSeq += 1;
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    try {
      this.audioPlayer.stop?.();
    } catch {
      // Ignore stop errors
    }
    try {
      this.speechSynthesizer.cancel();
    } catch {
      // Ignore cancel errors
    }
    if (this.state.playbackState !== 'idle') {
      this.updateState({ playbackState: 'idle' });
    }
  }

  public async speak(
    text: string,
    settings: AppSettings,
    audioCtrl: AudioDuckingAdapter = audioController,
  ): Promise<void> {
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) {
      return;
    }

    this.stop();
    const mySeq = this.speakSeq;
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    const engine: TtsEngineType =
      settings.ttsEngine === 'webspeech' ? 'webspeech' : 'piper';
    const voiceId: PiperVoiceId = isValidPiperVoiceId(settings.ttsVoiceId)
      ? settings.ttsVoiceId
      : 'sv_SE-nst-medium';
    const rate =
      typeof settings.ttsRate === 'number' &&
      Number.isFinite(settings.ttsRate) &&
      settings.ttsRate > 0
        ? Math.min(2.0, Math.max(0.5, settings.ttsRate))
        : 1.0;
    const volume =
      typeof settings.ttsVolume === 'number' &&
      Number.isFinite(settings.ttsVolume)
        ? Math.min(1.0, Math.max(0.0, settings.ttsVolume))
        : 1.0;
    const duckVolume =
      typeof settings.duckVolume === 'number' &&
      Number.isFinite(settings.duckVolume)
        ? Math.min(1.0, Math.max(0.0, settings.duckVolume))
        : 0.2;

    this.updateState({
      playbackState: 'loading',
      activeEngine: engine,
      activeVoiceId: engine === 'piper' ? voiceId : null,
      usedFallback: false,
      lastError: null,
    });

    const preState = audioCtrl.getState();
    if (preState.isPlaying && preState.volume > duckVolume) {
      await audioCtrl.duckVolume(duckVolume, 350);
      if (mySeq !== this.speakSeq || abortController.signal.aborted) {
        return;
      }
    }

    if (engine === 'piper') {
      try {
        const response = await this.fetchFn('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: trimmed,
            voiceId,
            rate,
          }),
          signal: abortController.signal,
        });

        if (mySeq !== this.speakSeq || abortController.signal.aborted) {
          return;
        }

        if (!response.ok) {
          throw new Error(`Piper TTS svarade med HTTP ${response.status}`);
        }

        const wavBuffer = await response.arrayBuffer();
        if (mySeq !== this.speakSeq || abortController.signal.aborted) {
          return;
        }

        if (!wavBuffer || wavBuffer.byteLength === 0) {
          throw new Error('Piper TTS returnerade tom ljuddata.');
        }

        this.updateState({
          playbackState: 'speaking',
          activeEngine: 'piper',
          activeVoiceId: voiceId,
          usedFallback: false,
          lastError: null,
        });

        await this.audioPlayer.playWav(wavBuffer, {
          volume,
          signal: abortController.signal,
        });

        if (mySeq !== this.speakSeq || abortController.signal.aborted) {
          return;
        }
      } catch (piperErr) {
        if (mySeq !== this.speakSeq || abortController.signal.aborted) {
          return;
        }

        const reason =
          piperErr instanceof Error && piperErr.message
            ? piperErr.message
            : 'Piper TTS ej tillgänglig';
        const fallbackMessage = `Piper ej tillgänglig (${reason}) – föll tillbaka till Web Speech.`;

        if (!this.speechSynthesizer.isSupported()) {
          if (this.activeAbortController === abortController) {
            this.activeAbortController = null;
          }
          this.updateState({
            playbackState: 'error',
            activeEngine: null,
            activeVoiceId: null,
            usedFallback: true,
            lastError: `${fallbackMessage} Web Speech API saknas.`,
          });
          return;
        }

        this.updateState({
          playbackState: 'speaking',
          activeEngine: 'webspeech',
          activeVoiceId: null,
          usedFallback: true,
          lastError: fallbackMessage,
        });

        try {
          await this.speechSynthesizer.speak({
            text: trimmed,
            lang: 'sv-SE',
            rate,
            volume,
            signal: abortController.signal,
          });
          if (mySeq !== this.speakSeq || abortController.signal.aborted) {
            return;
          }
        } catch (speechErr) {
          if (mySeq !== this.speakSeq || abortController.signal.aborted) {
            return;
          }
          if (this.activeAbortController === abortController) {
            this.activeAbortController = null;
          }
          this.updateState({
            playbackState: 'error',
            lastError:
              speechErr instanceof Error
                ? speechErr.message
                : 'Talsyntes misslyckades.',
          });
          return;
        }
      }
    } else {
      if (!this.speechSynthesizer.isSupported()) {
        if (this.activeAbortController === abortController) {
          this.activeAbortController = null;
        }
        this.updateState({
          playbackState: 'error',
          activeEngine: null,
          activeVoiceId: null,
          usedFallback: false,
          lastError: 'Web Speech API stöds inte i denna webbläsare.',
        });
        return;
      }

      this.updateState({
        playbackState: 'speaking',
        activeEngine: 'webspeech',
        activeVoiceId: null,
        usedFallback: false,
        lastError: null,
      });

      try {
        await this.speechSynthesizer.speak({
          text: trimmed,
          lang: 'sv-SE',
          rate,
          volume,
          signal: abortController.signal,
        });
        if (mySeq !== this.speakSeq || abortController.signal.aborted) {
          return;
        }
      } catch (speechErr) {
        if (mySeq !== this.speakSeq || abortController.signal.aborted) {
          return;
        }
        if (this.activeAbortController === abortController) {
          this.activeAbortController = null;
        }
        this.updateState({
          playbackState: 'error',
          lastError:
            speechErr instanceof Error
              ? speechErr.message
              : 'Web Speech-uppspelning misslyckades.',
        });
        return;
      }
    }

    if (mySeq !== this.speakSeq || abortController.signal.aborted) {
      return;
    }

    if (this.activeAbortController === abortController) {
      this.activeAbortController = null;
    }
    this.updateState({ playbackState: 'idle' });

    if (settings.ttsRestoreMusicAfter && audioCtrl.getState().isPlaying) {
      await audioCtrl.restoreVolume(1.0, 400);
    }
  }
}

export const ttsService = new TtsService();
