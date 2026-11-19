import { DEFAULT_SPOTIFY_CLIENT_ID } from '../data/defaults.ts';
import {
  getValidSpotifyAccessToken,
  refreshSpotifyToken,
} from './spotifyAuth.ts';

export const SPOTIFY_PLAYER_NAME = 'Hockey DJ Booth';
const SPOTIFY_SDK_SCRIPT_URL = 'https://sdk.scdn.co/spotify-player.js';
const SPOTIFY_SDK_SCRIPT_ID = 'spotify-web-playback-sdk';
const SDK_READY_TIMEOUT_MS = 2500;
const CONNECT_VOLUME_THROTTLE_MS = 180;
const NO_ACTIVE_DEVICE_ERROR =
  'Ingen aktiv Spotify-spelare hittades. Öppna Spotify-appen på datorn eller mobilen (eller aktivera Widevine DRM i webbläsaren) och klicka på Återanslut Spotify.';

export type SpotifyTransportMode = 'sdk' | 'connect';

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

export interface SpotifyPlayerInstance {
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement?: () => Promise<void>;
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
  onReady?: (deviceId: string, deviceName?: string) => void;
  onNotReady?: (deviceId: string) => void;
  onPlayerStateChanged?: (state: SpotifyWebPlaybackState | null) => void;
  onError?: (message: string) => void;
}

interface SpotifyConnectDeviceRaw {
  id?: string | null;
  name?: string;
  is_active?: boolean;
  is_restricted?: boolean;
  type?: string;
}

interface SpotifyDevicesApiResponse {
  devices?: SpotifyConnectDeviceRaw[];
}

export class SpotifyPlayerService {
  private player: SpotifyPlayerInstance | null = null;
  private deviceId: string | null = null;
  private deviceName: string | null = null;
  private transportMode: SpotifyTransportMode = 'sdk';
  private clientId: string = DEFAULT_SPOTIFY_CLIENT_ID;
  private ready = false;
  private lastError: string | null = null;
  private callbacks: SpotifyPlayerCallbacks = {};
  private sdkLoadPromise: Promise<void> | null = null;
  private connectAttemptCounter = 0;
  private connectReadyTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingConnectResolve: ((connected: boolean) => void) | null = null;
  private lastConnectVolumeSentAt = 0;
  private pendingConnectVolume: number | null = null;
  private connectVolumeTimer: ReturnType<typeof setTimeout> | null = null;

  public setCallbacks(callbacks: SpotifyPlayerCallbacks): void {
    this.callbacks = callbacks;
  }

  public getDeviceId(): string | null {
    return this.deviceId;
  }

  public getDeviceName(): string | null {
    return this.deviceName;
  }

  public getTransportMode(): SpotifyTransportMode {
    return this.transportMode;
  }

  public isReady(): boolean {
    return this.ready && this.deviceId !== null;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  private resolveClientId(clientId?: string): string {
    return clientId?.trim() || this.clientId.trim() || DEFAULT_SPOTIFY_CLIENT_ID;
  }

  private clearConnectTimers(): void {
    if (this.connectReadyTimer !== null) {
      clearTimeout(this.connectReadyTimer);
      this.connectReadyTimer = null;
    }
  }

  private clearVolumeThrottle(): void {
    if (this.connectVolumeTimer !== null) {
      clearTimeout(this.connectVolumeTimer);
      this.connectVolumeTimer = null;
    }
    this.pendingConnectVolume = null;
  }

  private teardownSdkPlayer(): void {
    if (this.player) {
      try {
        this.player.disconnect();
      } catch {
        // Ignore disconnect cleanup error
      }
      this.player = null;
    }
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

  public async discoverConnectDevice(
    clientId?: string,
  ): Promise<{ id: string; name: string } | null> {
    const effectiveClientId = this.resolveClientId(clientId);
    let token = await getValidSpotifyAccessToken(effectiveClientId);
    if (!token) {
      return null;
    }

    try {
      let response = await fetch('https://api.spotify.com/v1/me/player/devices', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        const refreshed = await refreshSpotifyToken(effectiveClientId);
        if (!refreshed?.accessToken) {
          return null;
        }
        token = refreshed.accessToken;
        response = await fetch('https://api.spotify.com/v1/me/player/devices', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as SpotifyDevicesApiResponse;
      const devices = Array.isArray(data.devices) ? data.devices : [];
      const available = devices.filter(
        (d): d is SpotifyConnectDeviceRaw & { id: string } =>
          !d.is_restricted && typeof d.id === 'string' && d.id.length > 0,
      );

      if (available.length === 0) {
        return null;
      }

      const chosen =
        available.find((d) => d.is_active === true) ??
        available.find((d) => d.name === SPOTIFY_PLAYER_NAME) ??
        available[0];

      const chosenName =
        typeof chosen.name === 'string' && chosen.name.trim()
          ? chosen.name.trim()
          : SPOTIFY_PLAYER_NAME;

      this.transportMode = 'connect';
      this.deviceId = chosen.id;
      this.deviceName = chosenName;
      this.ready = true;
      this.lastError = null;
      this.callbacks.onReady?.(chosen.id, chosenName);

      return { id: chosen.id, name: chosenName };
    } catch {
      return null;
    }
  }

  public async ensureReady(clientId?: string): Promise<boolean> {
    if (this.isReady()) {
      return true;
    }
    const effectiveClientId = this.resolveClientId(clientId);
    const token = await getValidSpotifyAccessToken(effectiveClientId);
    if (!token) {
      return false;
    }
    const device = await this.discoverConnectDevice(effectiveClientId);
    return device !== null;
  }

  public async connect(
    clientId?: string,
    initialVolume = 1.0,
  ): Promise<boolean> {
    this.clientId = clientId?.trim() || DEFAULT_SPOTIFY_CLIENT_ID;

    const token = await getValidSpotifyAccessToken(this.clientId);
    if (!token) {
      this.ready = false;
      this.lastError = null;
      return false;
    }

    if (typeof window === 'undefined') {
      const headlessDevice = await this.discoverConnectDevice(this.clientId);
      if (headlessDevice) {
        return true;
      }
      this.ready = false;
      return false;
    }

    try {
      await this.loadSdkScript();
    } catch {
      const fallbackDevice = await this.discoverConnectDevice(this.clientId);
      if (fallbackDevice) {
        return true;
      }
      this.ready = false;
      this.lastError = NO_ACTIVE_DEVICE_ERROR;
      this.callbacks.onError?.(this.lastError);
      return false;
    }

    if (!window.Spotify?.Player) {
      const fallbackDevice = await this.discoverConnectDevice(this.clientId);
      if (fallbackDevice) {
        return true;
      }
      this.ready = false;
      this.lastError = NO_ACTIVE_DEVICE_ERROR;
      this.callbacks.onError?.(this.lastError);
      return false;
    }

    this.disconnect();
    const attemptId = ++this.connectAttemptCounter;

    const clampedInitialVolume = Math.min(1, Math.max(0, initialVolume));
    const player = new window.Spotify.Player({
      name: SPOTIFY_PLAYER_NAME,
      volume: clampedInitialVolume,
      getOAuthToken: (cb) => {
        void getValidSpotifyAccessToken(this.clientId).then((freshToken) => {
          if (freshToken) {
            cb(freshToken);
          }
        });
      },
    });
    this.player = player;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let fallbackPromise: Promise<boolean> | null = null;
      let authRetryAttempted = false;
      let authRetryInProgress = false;

      const finish = (connected: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        this.clearConnectTimers();
        if (this.pendingConnectResolve === finish) {
          this.pendingConnectResolve = null;
        }
        resolve(connected);
      };

      this.pendingConnectResolve = finish;

      const triggerConnectFallback = (
        teardownOnStart: boolean,
      ): Promise<boolean> => {
        if (attemptId !== this.connectAttemptCounter) {
          finish(false);
          return Promise.resolve(false);
        }
        if (this.ready && this.transportMode === 'sdk') {
          finish(true);
          return Promise.resolve(true);
        }
        if (fallbackPromise) {
          return fallbackPromise;
        }

        fallbackPromise = (async () => {
          this.clearConnectTimers();
          if (teardownOnStart) {
            this.teardownSdkPlayer();
          }

          const device = await this.discoverConnectDevice(this.clientId);
          if (attemptId !== this.connectAttemptCounter) {
            finish(false);
            return false;
          }
          if (device) {
            this.teardownSdkPlayer();
            finish(true);
            return true;
          }
          if (this.ready && this.transportMode === 'sdk') {
            finish(true);
            return true;
          }

          this.ready = false;
          this.deviceId = null;
          this.deviceName = null;
          this.lastError = NO_ACTIVE_DEVICE_ERROR;
          this.callbacks.onError?.(this.lastError);
          finish(false);
          return false;
        })();

        return fallbackPromise;
      };

      const armReadyTimeout = () => {
        this.clearConnectTimers();
        this.connectReadyTimer = setTimeout(() => {
          if (
            attemptId !== this.connectAttemptCounter ||
            settled ||
            authRetryInProgress
          ) {
            return;
          }
          void triggerConnectFallback(false);
        }, SDK_READY_TIMEOUT_MS);
      };

      player.addListener('ready', ({ device_id }) => {
        if (attemptId !== this.connectAttemptCounter) {
          return;
        }
        if (this.transportMode === 'connect' && this.ready) {
          return;
        }
        this.transportMode = 'sdk';
        this.deviceId = device_id;
        this.deviceName = SPOTIFY_PLAYER_NAME;
        this.ready = true;
        this.lastError = null;
        this.callbacks.onReady?.(device_id, SPOTIFY_PLAYER_NAME);
        finish(true);
      });

      player.addListener('not_ready', ({ device_id }) => {
        if (attemptId !== this.connectAttemptCounter) {
          return;
        }
        if (this.transportMode === 'connect' && this.deviceId !== device_id) {
          return;
        }
        this.ready = false;
        if (this.deviceId === device_id) {
          this.deviceId = null;
          this.deviceName = null;
        }
        void this.discoverConnectDevice(this.clientId).then((fallback) => {
          if (attemptId === this.connectAttemptCounter && !fallback) {
            this.callbacks.onNotReady?.(device_id);
          }
        });
      });

      player.addListener('player_state_changed', (state) => {
        if (attemptId !== this.connectAttemptCounter) {
          return;
        }
        this.callbacks.onPlayerStateChanged?.(state);
      });

      player.addListener('initialization_error', () => {
        if (attemptId !== this.connectAttemptCounter) {
          return;
        }
        if (this.transportMode === 'connect' && this.ready) {
          return;
        }
        this.ready = false;
        void triggerConnectFallback(true);
      });

      player.addListener('authentication_error', ({ message }) => {
        if (attemptId !== this.connectAttemptCounter) {
          return;
        }
        this.ready = false;

        if (!authRetryAttempted) {
          authRetryAttempted = true;
          authRetryInProgress = true;
          void refreshSpotifyToken(this.clientId).then(async (refreshed) => {
            try {
              if (attemptId !== this.connectAttemptCounter) {
                return;
              }
              if (refreshed?.accessToken) {
                const reconnected = await player.connect().catch(() => false);
                if (attemptId !== this.connectAttemptCounter) {
                  return;
                }
                if (reconnected) {
                  armReadyTimeout();
                  return;
                }
                const device = await this.discoverConnectDevice(this.clientId);
                if (attemptId !== this.connectAttemptCounter) {
                  return;
                }
                if (device) {
                  this.teardownSdkPlayer();
                  finish(true);
                  return;
                }
              }
              this.lastError = `Spotify autentiseringsfel: ${message}`;
              this.callbacks.onError?.(this.lastError);
              finish(false);
            } finally {
              authRetryInProgress = false;
            }
          });
          return;
        }

        this.lastError = `Spotify autentiseringsfel: ${message}`;
        this.callbacks.onError?.(this.lastError);
        finish(false);
      });

      player.addListener('account_error', ({ message }) => {
        if (attemptId !== this.connectAttemptCounter) {
          return;
        }
        this.ready = false;
        this.lastError = `Spotify-konto kräver Premium: ${message}`;
        this.callbacks.onError?.(this.lastError);
        finish(false);
      });

      armReadyTimeout();

      void player
        .connect()
        .then((connected) => {
          if (attemptId !== this.connectAttemptCounter || settled) {
            return;
          }
          if (!connected) {
            void triggerConnectFallback(true);
          }
        })
        .catch(() => {
          if (attemptId !== this.connectAttemptCounter || settled) {
            return;
          }
          void triggerConnectFallback(true);
        });
    });
  }

  public disconnect(): void {
    this.connectAttemptCounter += 1;
    this.clearConnectTimers();
    this.clearVolumeThrottle();
    if (this.pendingConnectResolve) {
      const resolvePending = this.pendingConnectResolve;
      this.pendingConnectResolve = null;
      resolvePending(false);
    }
    this.teardownSdkPlayer();
    this.deviceId = null;
    this.deviceName = null;
    this.ready = false;
    this.transportMode = 'sdk';
  }

  public async playTrack(
    trackUri: string,
    positionMs: number,
    clientId?: string,
  ): Promise<void> {
    const effectiveClientId = this.resolveClientId(clientId);

    if (this.player?.activateElement) {
      await this.player.activateElement().catch(() => {});
    }

    if (!this.isReady()) {
      await this.ensureReady(effectiveClientId);
    }

    if (!this.deviceId || !this.ready) {
      throw new Error('Spotify-enheten är inte redo.');
    }

    let token = await getValidSpotifyAccessToken(effectiveClientId);
    if (!token) {
      throw new Error('Spotify-token saknas eller har gått ut.');
    }

    const body = JSON.stringify({
      uris: [trackUri],
      position_ms: Math.max(0, Math.round(positionMs)),
    });

    const sendPlayRequest = (accessToken: string, targetDeviceId: string) =>
      fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(targetDeviceId)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body,
        },
      );

    let response = await sendPlayRequest(token, this.deviceId);

    if (response.status === 401) {
      const refreshed = await refreshSpotifyToken(effectiveClientId);
      if (refreshed?.accessToken) {
        token = refreshed.accessToken;
        response = await sendPlayRequest(token, this.deviceId);
      }
    }

    if (response.status === 404) {
      let retryDeviceId: string | null = null;
      try {
        const transferRes = await fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            device_ids: [this.deviceId],
            play: false,
          }),
        });
        if (transferRes.ok) {
          retryDeviceId = this.deviceId;
        }
      } catch {
        // Fall through to Connect device rediscovery
      }

      if (!retryDeviceId) {
        const discovered = await this.discoverConnectDevice(effectiveClientId);
        if (discovered) {
          retryDeviceId = discovered.id;
        }
      }

      if (retryDeviceId) {
        response = await sendPlayRequest(token, retryDeviceId);
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
    if (this.transportMode === 'sdk') {
      if (!this.player) {
        return;
      }
      try {
        await this.player.pause();
      } catch {
        // Calm Tech: ignore pause failure if device disconnected
      }
      return;
    }

    if (!this.deviceId) {
      return;
    }
    const token = await getValidSpotifyAccessToken(this.clientId);
    if (!token) {
      return;
    }
    try {
      await fetch(
        `https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(this.deviceId)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
    } catch {
      // Calm Tech: ignore pause failure if device disconnected
    }
  }

  private async sendConnectVolume(volumePercent: number): Promise<void> {
    if (this.transportMode !== 'connect' || !this.deviceId) {
      return;
    }
    const token = await getValidSpotifyAccessToken(this.clientId);
    if (!token) {
      return;
    }
    try {
      await fetch(
        `https://api.spotify.com/v1/me/player/volume?volume_percent=${volumePercent}&device_id=${encodeURIComponent(this.deviceId)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
    } catch {
      // Calm Tech: ignore transient volume error
    }
  }

  public async setVolume(volume: number): Promise<void> {
    const clamped = Math.min(1, Math.max(0, volume));

    if (this.transportMode === 'sdk') {
      if (!this.player) {
        return;
      }
      try {
        await this.player.setVolume(clamped);
      } catch {
        // Calm Tech: ignore transient volume error
      }
      return;
    }

    if (!this.deviceId) {
      return;
    }

    const volumePercent = Math.round(clamped * 100);
    const now = Date.now();
    const elapsed = now - this.lastConnectVolumeSentAt;

    if (
      elapsed >= CONNECT_VOLUME_THROTTLE_MS &&
      this.connectVolumeTimer === null
    ) {
      this.lastConnectVolumeSentAt = now;
      this.pendingConnectVolume = null;
      await this.sendConnectVolume(volumePercent);
      return;
    }

    this.pendingConnectVolume = volumePercent;
    if (this.connectVolumeTimer === null) {
      const waitMs = Math.max(1, CONNECT_VOLUME_THROTTLE_MS - elapsed);
      this.connectVolumeTimer = setTimeout(() => {
        this.connectVolumeTimer = null;
        if (this.pendingConnectVolume !== null) {
          const finalPercent = this.pendingConnectVolume;
          this.pendingConnectVolume = null;
          this.lastConnectVolumeSentAt = Date.now();
          void this.sendConnectVolume(finalPercent);
        }
      }, waitMs);
    }
  }
}

export const spotifyPlayerService = new SpotifyPlayerService();
