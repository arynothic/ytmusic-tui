import type { Logger } from 'pino';

import { AuthError } from '@/core/errors';
import type { MusicGateway, SecretStore } from '@/core/ports';
import { CredentialsSchema, type Credentials } from '@/models';

/** Key under which credentials are kept in the SecretStore. */
export const CREDENTIALS_KEY = 'youtube-music';

/** Snapshot of the login state, e.g. for `ytmusic login --status`. */
export interface SessionStatus {
  readonly loggedIn: boolean;
  readonly userName?: string;
  readonly savedAt?: string;
  readonly store: string;
}

/**
 * Owns the credential lifecycle: validating new credentials against the
 * gateway, persisting them in the SecretStore, restoring sessions, and
 * logout. Cookie sessions cannot be refreshed client-side; validation on
 * load is the refresh mechanism, and expired sessions push the user to
 * log in again with an explicit error.
 */
export class SessionManager {
  readonly store: SecretStore;
  readonly gateway: MusicGateway;
  readonly logger: Logger | undefined;

  constructor(store: SecretStore, gateway: MusicGateway, logger?: Logger) {
    this.store = store;
    this.gateway = gateway;
    this.logger = logger;
  }

  /**
   * Validates new credentials against the backend and persists them.
   * Throws {@link AuthError} when the backend rejects them.
   */
  async login(input: { cookie: string; visitorData?: string }): Promise<Credentials> {
    const base: Credentials = {
      cookie: input.cookie,
      savedAt: new Date().toISOString(),
      ...(input.visitorData !== undefined ? { visitorData: input.visitorData } : {}),
    };
    try {
      await this.gateway.authenticate(base);
    } catch (error) {
      throw error instanceof AuthError
        ? error
        : new AuthError(
            'AUTH_INVALID_CREDENTIALS',
            'The provided cookies were rejected by YouTube Music',
            { cause: error },
          );
    }
    const userName = await this.gateway.getAuthenticatedUser().catch(() => undefined);
    const credentials: Credentials = {
      ...base,
      ...(userName !== undefined ? { userName } : {}),
    };
    await this.store.set(CREDENTIALS_KEY, JSON.stringify(credentials));
    this.logger?.info({ userName }, 'login succeeded');
    return credentials;
  }

  /** Removes stored credentials and drops them from the gateway. */
  async logout(): Promise<void> {
    await this.store.delete(CREDENTIALS_KEY);
    await this.gateway.deauthenticate();
    this.logger?.info('logged out');
  }

  /**
   * Reads stored credentials, or undefined when not logged in.
   * Throws {@link AuthError} when the stored value is corrupted.
   */
  async loadCredentials(): Promise<Credentials | undefined> {
    const raw = await this.store.get(CREDENTIALS_KEY);
    if (raw === undefined) {
      return undefined;
    }
    try {
      const json: unknown = JSON.parse(raw);
      return CredentialsSchema.parse(json);
    } catch (error) {
      throw new AuthError(
        'AUTH_INVALID_CREDENTIALS',
        'Stored credentials are corrupted; please log in again',
        { cause: error },
      );
    }
  }

  /**
   * Loads stored credentials into the gateway.
   * Returns false when no credentials are stored.
   */
  async restoreSession(): Promise<boolean> {
    const credentials = await this.loadCredentials();
    if (credentials === undefined) {
      return false;
    }
    await this.gateway.authenticate(credentials);
    return true;
  }

  /** Like {@link restoreSession} but throws {@link AuthError} when logged out. */
  async requireSession(): Promise<Credentials> {
    const credentials = await this.loadCredentials();
    if (credentials === undefined) {
      throw new AuthError('AUTH_REQUIRED', 'Not logged in. Run `ytmusic login` first.');
    }
    await this.gateway.authenticate(credentials);
    return credentials;
  }

  /** Current login state. */
  async status(): Promise<SessionStatus> {
    const credentials = await this.loadCredentials();
    if (credentials === undefined) {
      return { loggedIn: false, store: this.store.name };
    }
    return {
      loggedIn: true,
      store: this.store.name,
      savedAt: credentials.savedAt,
      ...(credentials.userName !== undefined ? { userName: credentials.userName } : {}),
    };
  }
}
