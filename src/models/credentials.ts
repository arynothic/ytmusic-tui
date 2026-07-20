import { z } from 'zod';

/** Browser-session credentials for the YouTube Music backend. */
export const CredentialsSchema = z.object({
  /** Full `Cookie` header value captured from an authenticated browser. */
  cookie: z.string().min(1),
  /** Visitor data token (`X-Goog-Visitor-Id`), improves session stability. */
  visitorData: z.string().optional(),
  /** Display name of the logged-in user, captured at login time. */
  userName: z.string().optional(),
  /** ISO timestamp of when the credentials were saved. */
  savedAt: z.iso.datetime(),
});
export type Credentials = z.infer<typeof CredentialsSchema>;
