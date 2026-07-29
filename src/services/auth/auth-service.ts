import { importCookies, type SessionManager, type SessionStatus } from '@/auth';
import type { Credentials } from '@/models';

/** Options for {@link AuthService}. */
export interface AuthServiceOptions {
  readonly sessionManager: SessionManager;
}

/**
 * CLI-facing authentication: cookie import (header or Netscape export),
 * login/logout, and the session guard used by authenticated commands.
 */
export class AuthService {
  readonly #sessionManager: SessionManager;

  constructor(options: AuthServiceOptions) {
    this.#sessionManager = options.sessionManager;
  }

  /**
   * Logs in from a raw cookie export. Accepts either a `Cookie:` header
   * value or a Netscape cookies.txt file content; the interesting
   * session cookies are extracted automatically.
   */
  loginWithCookieExport(input: string): Promise<Credentials> {
    const cookie = importCookies(input);
    return this.#sessionManager.login({ cookie });
  }

  /** Logs in from an already-normalized cookie string. */
  login(input: { cookie: string; visitorData?: string }): Promise<Credentials> {
    return this.#sessionManager.login(input);
  }

  /** Removes stored credentials and drops the gateway session. */
  logout(): Promise<void> {
    return this.#sessionManager.logout();
  }

  /** Current login state. */
  status(): Promise<SessionStatus> {
    return this.#sessionManager.status();
  }

  /**
   * Ensures a stored session is loaded into the gateway.
   * Throws AuthError(AUTH_REQUIRED) when the user is logged out.
   */
  async ensureAuthenticated(): Promise<void> {
    await this.#sessionManager.requireSession();
  }
}
