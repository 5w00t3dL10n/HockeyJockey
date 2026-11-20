import type {
  AppSettings,
  AudioStateSnapshot,
  PiperVoiceId,
  TtsAudioProfile,
  TtsDspChainConfig,
  TtsEngineType,
  TtsStatusResponse,
} from '../types/models.ts';
import {
  calculatePiperProsodyParams,
  computeTtsDspChainConfig,
  formatTextForArenaProsody,
  isValidPiperVoiceId,
  isValidTtsAudioProfile,
} from '../utils/domain.ts';
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

export interface TtsAudioPlayerOptions {
  volume: number;
  signal?: AbortSignal;
  audioProfile?: TtsAudioProfile;
  arenaReverbMix?: number;
  preChimeEnabled?: boolean;
}

export interface TtsAudioPlayer {
  playWav(
    audioBuffer: ArrayBuffer,
    options: TtsAudioPlayerOptions,
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

function getAudioContextConstructor(): (new () => AudioContext) | null {
  const globalCtx = (
    globalThis as typeof globalThis & {
      AudioContext?: new () => AudioContext;
      webkitAudioContext?: new () => AudioContext;
    }
  ).AudioContext;
  if (typeof globalCtx === 'function') {
    return globalCtx;
  }
  if (typeof window !== 'undefined') {
    const win = window as Window & {
      AudioContext?: new () => AudioContext;
      webkitAudioContext?: new () => AudioContext;
    };
    const ctor = win.AudioContext ?? win.webkitAudioContext;
    if (typeof ctor === 'function') {
      return ctor;
    }
  }
  return null;
}

class BrowserTtsAudioPlayer implements TtsAudioPlayer {
  private playSeq = 0;
  private audioContext: AudioContext | null = null;
  private impulseCache = new Map<string, AudioBuffer>();
  private activeWebAudioStop: (() => void) | null = null;
  private activeAudio: HTMLAudioElement | null = null;
  private activeObjectUrl: string | null = null;
  private activeAbortHandler: (() => void) | null = null;

  public stop(): void {
    this.playSeq += 1;
    const webAudioStop = this.activeWebAudioStop;
    this.activeWebAudioStop = null;
    const abortHandler = this.activeAbortHandler;
    this.activeAbortHandler = null;

    webAudioStop?.();

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

  private getOrCreateAudioContext(): AudioContext | null {
    const AudioCtx = getAudioContextConstructor();
    if (!AudioCtx) {
      return null;
    }
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioCtx();
      this.impulseCache.clear();
    }
    return this.audioContext;
  }

  private getOrCreateImpulseResponse(
    ctx: AudioContext,
    durationSec: number,
    decay: number,
  ): AudioBuffer {
    const key = `${ctx.sampleRate}|${durationSec}|${decay}`;
    const cached = this.impulseCache.get(key);
    if (cached) {
      return cached;
    }

    const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    const preDelaySamples = Math.min(
      length - 1,
      Math.floor(ctx.sampleRate * 0.018),
    );
    const tailLength = Math.max(1, length - preDelaySamples);

    for (let ch = 0; ch < 2; ch += 1) {
      const channelData = impulse.getChannelData(ch);
      let lpState = 0;
      for (let i = preDelaySamples; i < length; i += 1) {
        const progress = (i - preDelaySamples) / tailLength;
        const envelope = Math.pow(1 - progress, decay);
        const white = Math.random() * 2 - 1;
        lpState = lpState * 0.55 + white * 0.45;
        channelData[i] = lpState * envelope * 0.6;
      }
    }

    this.impulseCache.set(key, impulse);
    return impulse;
  }

  private buildDspChain(
    ctx: AudioContext,
    dspConfig: TtsDspChainConfig,
    masterGain: GainNode,
  ): { inputNode: AudioNode; nodes: AudioNode[] } {
    const inputBus = ctx.createGain();
    inputBus.gain.value = 1.0;

    if (dspConfig.bypass) {
      inputBus.connect(masterGain);
      return { inputNode: inputBus, nodes: [inputBus] };
    }

    const nodes: AudioNode[] = [inputBus];

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = dspConfig.highpassHz;
    highpass.Q.value = 0.707;
    nodes.push(highpass);

    const chestEq = ctx.createBiquadFilter();
    chestEq.type = 'peaking';
    chestEq.frequency.value = dspConfig.chestPeakHz;
    chestEq.gain.value = dspConfig.chestGainDb;
    chestEq.Q.value = dspConfig.chestQ;
    nodes.push(chestEq);

    const presenceEq = ctx.createBiquadFilter();
    presenceEq.type = 'peaking';
    presenceEq.frequency.value = dspConfig.presencePeakHz;
    presenceEq.gain.value = dspConfig.presenceGainDb;
    presenceEq.Q.value = dspConfig.presenceQ;
    nodes.push(presenceEq);

    const deHarsher = ctx.createBiquadFilter();
    deHarsher.type = 'lowpass';
    deHarsher.frequency.value = dspConfig.deHarshLowpassHz;
    deHarsher.Q.value = dspConfig.deHarshQ;
    nodes.push(deHarsher);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = dspConfig.compressor.thresholdDb;
    compressor.knee.value = dspConfig.compressor.kneeDb;
    compressor.ratio.value = dspConfig.compressor.ratio;
    compressor.attack.value = dspConfig.compressor.attackSec;
    compressor.release.value = dspConfig.compressor.releaseSec;
    nodes.push(compressor);

    const makeupGain = ctx.createGain();
    makeupGain.gain.value = dspConfig.compressor.makeupGain;
    nodes.push(makeupGain);

    inputBus.connect(highpass);
    highpass.connect(chestEq);
    chestEq.connect(presenceEq);
    presenceEq.connect(deHarsher);
    deHarsher.connect(compressor);
    compressor.connect(makeupGain);

    const dryGain = ctx.createGain();
    dryGain.gain.value = dspConfig.dryMix;
    nodes.push(dryGain);
    makeupGain.connect(dryGain);
    dryGain.connect(masterGain);

    if (dspConfig.wetMix > 0) {
      const wetGain = ctx.createGain();
      wetGain.gain.value = dspConfig.wetMix;
      nodes.push(wetGain);
      wetGain.connect(masterGain);

      if (dspConfig.slapbackDelaySec > 0) {
        const slapbackDelay = ctx.createDelay(1.0);
        slapbackDelay.delayTime.value = dspConfig.slapbackDelaySec;
        const slapbackOutGain = ctx.createGain();
        slapbackOutGain.gain.value = 0.4;
        nodes.push(slapbackDelay, slapbackOutGain);

        makeupGain.connect(slapbackDelay);
        slapbackDelay.connect(slapbackOutGain);
        slapbackOutGain.connect(wetGain);

        if (dspConfig.slapbackFeedback > 0) {
          const slapbackFeedback = ctx.createGain();
          slapbackFeedback.gain.value = dspConfig.slapbackFeedback;
          nodes.push(slapbackFeedback);
          slapbackDelay.connect(slapbackFeedback);
          slapbackFeedback.connect(slapbackDelay);
        }
      }

      if (
        dspConfig.reverbDurationSec > 0 &&
        typeof ctx.createConvolver === 'function'
      ) {
        const convolver = ctx.createConvolver();
        convolver.buffer = this.getOrCreateImpulseResponse(
          ctx,
          dspConfig.reverbDurationSec,
          dspConfig.reverbDecay,
        );
        nodes.push(convolver);
        makeupGain.connect(convolver);
        convolver.connect(wetGain);
      }
    }

    return { inputNode: inputBus, nodes };
  }

  private schedulePreChime(
    ctx: AudioContext,
    targetNode: AudioNode,
    startTimeSec: number,
  ): {
    sources: OscillatorNode[];
    nodes: AudioNode[];
    voiceStartTimeSec: number;
  } {
    if (typeof ctx.createOscillator !== 'function') {
      return { sources: [], nodes: [], voiceStartTimeSec: startTimeSec };
    }

    const sources: OscillatorNode[] = [];
    const nodes: AudioNode[] = [];

    const notes = [
      { freqHz: 587.33, offsetSec: 0, peakGain: 0.18, durationSec: 0.14 }, // D5
      { freqHz: 880.0, offsetSec: 0.115, peakGain: 0.22, durationSec: 0.16 }, // A5
    ];

    for (const note of notes) {
      const t0 = startTimeSec + note.offsetSec;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freqHz, t0);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(note.peakGain, t0 + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + note.durationSec);

      osc.connect(env);
      env.connect(targetNode);
      osc.start(t0);
      osc.stop(t0 + note.durationSec + 0.01);

      sources.push(osc);
      nodes.push(osc, env);
    }

    return {
      sources,
      nodes,
      voiceStartTimeSec: startTimeSec + 0.26,
    };
  }

  private async playWithWebAudio(
    audioBuffer: ArrayBuffer,
    options: TtsAudioPlayerOptions,
    mySeq: number,
  ): Promise<'played' | 'aborted'> {
    const ctx = this.getOrCreateAudioContext();
    if (!ctx) {
      throw new Error('AudioContext saknas.');
    }

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (mySeq !== this.playSeq || options.signal?.aborted) {
      return 'aborted';
    }

    const bufferCopy = audioBuffer.slice(0);
    const decodedBuffer = await ctx.decodeAudioData(bufferCopy);

    if (mySeq !== this.playSeq || options.signal?.aborted) {
      return 'aborted';
    }

    const dspConfig = computeTtsDspChainConfig(
      options.audioProfile ?? 'arena_pa',
      options.arenaReverbMix ?? 0.28,
    );

    const masterGain = ctx.createGain();
    masterGain.gain.value = Math.min(1, Math.max(0, options.volume));
    masterGain.connect(ctx.destination);

    const chain = this.buildDspChain(ctx, dspConfig, masterGain);
    const baseTimeSec = ctx.currentTime + 0.01;
    const chime = options.preChimeEnabled
      ? this.schedulePreChime(ctx, chain.inputNode, baseTimeSec)
      : { sources: [], nodes: [], voiceStartTimeSec: baseTimeSec };

    const voiceSource = ctx.createBufferSource();
    voiceSource.buffer = decodedBuffer;
    voiceSource.connect(chain.inputNode);

    const allNodes: AudioNode[] = [
      voiceSource,
      masterGain,
      ...chain.nodes,
      ...chime.nodes,
    ];

    await new Promise<void>((resolve) => {
      let settled = false;

      const teardown = () => {
        voiceSource.onended = null;
        options.signal?.removeEventListener('abort', onAbort);
        if (this.activeWebAudioStop === onStop) {
          this.activeWebAudioStop = null;
        }
        if (this.activeAbortHandler === onAbort) {
          this.activeAbortHandler = null;
        }

        try {
          voiceSource.stop();
        } catch {
          // Ignore if source has not started or already stopped
        }
        for (const osc of chime.sources) {
          try {
            osc.stop();
          } catch {
            // Ignore oscillator stop errors
          }
        }
        for (const node of allNodes) {
          try {
            node.disconnect();
          } catch {
            // Ignore disconnect errors
          }
        }
      };

      const finish = () => {
        if (settled) return;
        settled = true;
        teardown();
        resolve();
      };

      const onStop = () => {
        finish();
      };

      const onAbort = () => {
        finish();
      };

      this.activeWebAudioStop = onStop;
      this.activeAbortHandler = onAbort;
      voiceSource.onended = finish;
      options.signal?.addEventListener('abort', onAbort, { once: true });

      voiceSource.start(chime.voiceStartTimeSec);
    });

    return mySeq === this.playSeq && !options.signal?.aborted
      ? 'played'
      : 'aborted';
  }

  private playWithHtmlAudio(
    audioBuffer: ArrayBuffer,
    options: TtsAudioPlayerOptions,
    mySeq: number,
  ): Promise<void> {
    if (mySeq !== this.playSeq || options.signal?.aborted) {
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

  public async playWav(
    audioBuffer: ArrayBuffer,
    options: TtsAudioPlayerOptions,
  ): Promise<void> {
    this.stop();
    const mySeq = this.playSeq;

    if (options.signal?.aborted) {
      return;
    }

    if (getAudioContextConstructor()) {
      try {
        const outcome = await this.playWithWebAudio(audioBuffer, options, mySeq);
        if (outcome === 'played' || outcome === 'aborted') {
          return;
        }
      } catch {
        if (mySeq !== this.playSeq || options.signal?.aborted) {
          return;
        }
      }
    }

    if (mySeq !== this.playSeq || options.signal?.aborted) {
      return;
    }

    return this.playWithHtmlAudio(audioBuffer, options, mySeq);
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
    const dramaticPauses =
      typeof settings.ttsDramaticPauses === 'boolean'
        ? settings.ttsDramaticPauses
        : true;
    const spokenText =
      formatTextForArenaProsody(trimmed, dramaticPauses) || trimmed;
    const prosody = calculatePiperProsodyParams({
      rate,
      sentenceSilenceSec: settings.ttsSentenceSilenceSec,
      expressiveness: settings.ttsExpressiveness,
    });
    const audioProfile: TtsAudioProfile = isValidTtsAudioProfile(
      settings.ttsAudioProfile,
    )
      ? settings.ttsAudioProfile
      : 'arena_pa';
    const arenaReverbMix =
      typeof settings.ttsArenaReverbMix === 'number' &&
      Number.isFinite(settings.ttsArenaReverbMix)
        ? Math.min(0.8, Math.max(0.0, settings.ttsArenaReverbMix))
        : 0.28;
    const preChimeEnabled = Boolean(settings.ttsPreChimeEnabled);

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
            text: spokenText,
            voiceId,
            rate,
            sentenceSilence: prosody.sentenceSilence,
            noiseScale: prosody.noiseScale,
            noiseW: prosody.noiseW,
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
          audioProfile,
          arenaReverbMix,
          preChimeEnabled,
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
            text: spokenText,
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
          text: spokenText,
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
