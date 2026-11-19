import {
  getValidSpotifyAccessToken,
  refreshSpotifyToken,
} from './spotifyAuth.ts';

export const SPOTIFY_PLAYER_NAME = 'Hockey DJ Booth';
const SPOTIFY_SDK_SCRIPT_URL = 'https://sdk.scdn.co/spotify-player.js';
const SPOTIFY_SDK_SCRIPT_ID = 'spotify-web-playback-sdk';

export interface SpotifyWebPlaybackTrack {
  uri: string;
  name: string;
  artists: Array<{ name: string }>;
}

export interface SpotifyWebPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: SpotifyWebPlaybackTrack | null;
  };
}

interface SpotifyPlayerInstance {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(
    event: 'ready' | 'not_ready',
    cb: (payload: { device_id: string }) => void,
  ): boolean;
  addListener(
    event: 'player_state_changed',
    cb: (state: SpotifyWebPlaybackState | null) => void,
  ): boolean;
  addListener(
    event: 'initialization_error' | 'authentication_error' | 'account_error',
    cb: (payload: { message: string }) => void,
  ): boolean;
  removeListener(event: string): boolean;
  pause(): Promise<void>;
  resume(): Promise<void>;
  setVolume(volume: number): Promise<void>;
  getCurrentState(): Promise<SpotifyWebPlaybackState | null>;
}

interface SpotifyGlobalNamespace {
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SpotifyPlayerInstance;
}

declare global {
  interface Window {
    Spotify?: SpotifyGlobalNamespace;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export interface SpotifyPlayerCallbacks {
  onReady?: (deviceId: string) => void;
  onNotReady?: (deviceId: string) => void;
  onPlayerStateChanged?: (state: SpotifyWebPlaybackState | null) => void;
  onError?: (message: string) => void;
}

export class SpotifyPlayerService {
  private player: SpotifyPlayerInstance | null = null;
  private deviceId: string | null = null;
  private ready = false;
  private lastError: string | null = null;
  private callbacks: SpotifyPlayerCallbacks = {};
  private sdkLoadPromise: Promise<void> | null = null;

  public setCallbacks(callbacks: SpotifyPlayerCallbacks): void {
    this.callbacks = callbacks;
  }

  public getDeviceId(): string | null {
    return this.deviceId;
  }

  public isReady(): boolean {
    return this.ready && this.deviceId !== null;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  private loadSdkScript(): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return Promise.reject(
        new Error('Spotify Web Playback SDK kräver webbläsarmiljö.'),
      );
    }

    if (window.Spotify?.Player) {
      return Promise.resolve();
    }

    if (this.sdkLoadPromise) {
      return this.sdkLoadPromise;
    }

    this.sdkLoadPromise = new Promise<void>((resolve, reject) => {
      const existingCallback = window.onSpotifyWebPlaybackSDKReady;
      window.onSpotifyWebPlaybackSDKReady = () => {
        existingCallback?.();
        resolve();
      };

      const existingScript = document.getElementById(SPOTIFY_SDK_SCRIPT_ID);
      if (existingScript) {
        if (window.Spotify?.Player) {
          resolve();
        }
        return;
      }

      const script = document.createElement('script');
      script.id = SPOTIFY_SDK_SCRIPT_ID;
      script.src = SPOTIFY_SDK_SCRIPT_URL;
      script.async = true;
      script.onerror = () => {
        this.sdkLoadPromise = null;
        reject(new Error('Kunde inte ladda Spotify Web Playback SDK.'));
      };
      document.body.appendChild(script);
    });

    return this.sdkLoadPromise;
  }

  public async connect(
    clientId?: string,
    initialVolume = 1.0,
  ): Promise<boolean> {
    if (typeof window === 'undefined') {
      this.ready = false;
      return false;
    }

    const token = await getValidSpotifyAccessToken(clientId);
    if (!token) {
      this.ready = false;
      this.lastError = null;
      return false;
    }

    try {
      await this.loadSdkScript();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Spotify SDK kunde inte laddas.';
      this.lastError = message;
      this.callbacks.onError?.(message);
      return false;
    }

    if (!window.Spotify?.Player) {
      const message = 'Spotify Web Playback SDK saknas efter inladdning.';
      this.lastError = message;
      this.callbacks.onError?.(message);
      return false;
    }

    if (this.player) {
      this.disconnect();
    }

    const clampedInitialVolume = Math.min(1, Math.max(0, initialVolume));
    const player = new window.Spotify.Player({
      name: SPOTIFY_PLAYER_NAME,
      volume: clampedInitialVolume,
      getOAuthToken: (cb) => {
        void getValidSpotifyAccessToken(clientId).then((freshToken) => {
          if (freshToken) {
            cb(freshToken);
          }
        });
      },
    });

    player.addListener('ready', ({ device_id }) => {
      this.deviceId = device_id;
      this.ready = true;
      this.lastError = null;
      this.callbacks.onReady?.(device_id);
    });

    player.addListener('not_ready', ({ device_id }) => {
      this.ready = false;
      if (this.deviceId === device_id) {
        this.deviceId = null;
      }
      this.callbacks.onNotReady?.(device_id);
    });

    player.addListener('player_state_changed', (state) => {
      this.callbacks.onPlayerStateChanged?.(state);
    });

    player.addListener('initialization_error', ({ message }) => {
      this.ready = false;
      this.lastError = `Spotify init-fel: ${message}`;
      this.callbacks.onError?.(this.lastError);
    });

    player.addListener('authentication_error', ({ message }) => {
      this.ready = false;
      this.lastError = `Spotify autentiseringsfel: ${message}`;
      void refreshSpotifyToken(clientId);
      this.callbacks.onError?.(this.lastError);
    });

    player.addListener('account_error', ({ message }) => {
      this.ready = false;
      this.lastError = `Spotify-konto kräver Premium: ${message}`;
      this.callbacks.onError?.(this.lastError);
    });

    this.player = player;
    const connected = await player.connect();
    if (!connected) {
      this.ready = false;
      this.lastError = 'Kunde inte ansluta till Spotify Web Playback SDK.';
      this.callbacks.onError?.(this.lastError);
    }
    return connected;
  }

  public disconnect(): void {
    if (this.player) {
      try {
        this.player.disconnect();
      } catch {
        // Ignore disconnect cleanup error
      }
      this.player = null;
    }
    this.deviceId = null;
    this.ready = false;
  }

  public async playTrack(
    trackUri: string,
    positionMs: number,
    clientId?: string,
  ): Promise<void> {
    if (!this.deviceId || !this.ready) {
      throw new Error('Spotify-enheten är inte redo.');
    }

    let token = await getValidSpotifyAccessToken(clientId);
    if (!token) {
      throw new Error('Spotify-token saknas eller har gått ut.');
    }

    const endpoint = `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(this.deviceId)}`;
    const body = JSON.stringify({
      uris: [trackUri],
      position_ms: Math.max(0, Math.round(positionMs)),
    });

    let response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (response.status === 401) {
      const refreshed = await refreshSpotifyToken(clientId);
      if (refreshed?.accessToken) {
        token = refreshed.accessToken;
        response = await fetch(endpoint, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body,
        });
      }
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as {
          error?: { message?: string };
        };
        if (errJson.error?.message) {
          detail = errJson.error.message;
        }
      } catch {
        // Ignore body parse failure
      }
      throw new Error(`Spotify uppspelning misslyckades: ${detail}`);
    }
  }

  public async pause(): Promise<void> {
    if (!this.player) {
      return;
    }
    try {
      await this.player.pause();
    } catch {
      // Calm Tech: ignore pause failure if device disconnected
    }
  }

  public async setVolume(volume: number): Promise<void> {
    if (!this.player) {
      return;
    }
    const clamped = Math.min(1, Math.max(0, volume));
    try {
      await this.player.setVolume(clamped);
    } catch {
      // Calm Tech: ignore transient volume error
    }
  }
}

export const spotifyPlayerService = new SpotifyPlayerService();
