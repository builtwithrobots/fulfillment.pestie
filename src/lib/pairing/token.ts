import 'server-only'

import { SignJWT, jwtVerify } from 'jose'

/**
 * Station-display tokens.
 *
 * Station screens are NOT Clerk users — they authenticate with a signed,
 * station-scoped token minted during Netflix-style pairing:
 *   1. Admin generates a pairing code for a station (short-lived, ~10 min).
 *   2. The screen submits the code and receives a permanent display token.
 *   3. The screen sends that token on every request to /display/[token].
 *
 * Tokens are signed with TOKEN_SIGNING_SECRET (HS256). `exp` is set only for
 * the initial pairing code; the paired display token is long-lived and revoked
 * by rotating the station's token version in the DB.
 */
const secret = () => new TextEncoder().encode(process.env.TOKEN_SIGNING_SECRET!)

const ISSUER = 'fulfillment.pestie'
const AUDIENCE = 'station-display'

export type DisplayClaims = {
  stationId: string
  /** Bumped in the DB to revoke previously issued tokens for a station. */
  tokenVersion: number
}

/** Mint a permanent display token for a paired station. */
export async function signDisplayToken(claims: DisplayClaims): Promise<string> {
  return new SignJWT({ stationId: claims.stationId, tv: claims.tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(secret())
}

/** Mint a short-lived pairing code token (expires in `ttlSeconds`). */
export async function signPairingCode(stationId: string, ttlSeconds = 600): Promise<string> {
  return new SignJWT({ stationId, kind: 'pairing' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret())
}

/** Verify a display token. Returns claims or null if invalid/expired. */
export async function verifyDisplayToken(token: string): Promise<DisplayClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    })
    if (typeof payload.stationId !== 'string' || typeof payload.tv !== 'number') return null
    return { stationId: payload.stationId, tokenVersion: payload.tv }
  } catch {
    return null
  }
}
