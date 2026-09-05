import { JwtClaims } from './token';

/**
 * The authenticated principal (who is making a request).
 * The merchant_id MUST come from the verified token/session, never from
 * user-supplied request fields (spec §41).
 */
export interface AuthenticatedPrincipal {
  merchantId: string;
  /** Arbitrary claims preserved from the token. */
  claims: JwtClaims;
}

/** Config required to issue/verify session tokens (from env). */
export interface TokenConfig {
  secret: string;
  issuer: string;
  /** Session lifetime in seconds (e.g. 3600 * 8 = 8h). */
  expiresInSeconds: number;
}