// Verifies Firebase ID tokens (issued when a user signs in through the
// Firebase "Sign in with Google" popup on the frontend) without pulling in
// firebase-admin. We can't rely on network access being available when
// installing dependencies in every environment this panel runs in, so this
// uses only packages already in package.json (jsonwebtoken) plus Node's
// built-in crypto/fetch.
//
// Verification follows Firebase's documented steps for verifying ID tokens
// without the Admin SDK:
//   https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
// 1. Fetch Google's current public certs for the securetoken service.
// 2. Check the token's `kid` header matches one of those certs.
// 3. Verify the RS256 signature, audience (= Firebase project id),
//    issuer, and expiry.
// 4. Confirm the email on the token is actually verified.

import jwt from "jsonwebtoken";

const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const CERTS_TTL_MS = 60 * 60 * 1000; // Google rotates these infrequently; re-fetch hourly.

let certsCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getFirebaseCerts(): Promise<Record<string, string>> {
  if (certsCache && Date.now() < certsCache.expiresAt) {
    return certsCache.certs;
  }
  const res = await fetch(CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase signing certs (HTTP ${res.status})`);
  }
  const certs = (await res.json()) as Record<string, string>;
  certsCache = { certs, expiresAt: Date.now() + CERTS_TTL_MS };
  return certs;
}

export interface VerifiedGoogleUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string
): Promise<VerifiedGoogleUser> {
  if (!projectId) {
    throw new Error("Server is missing a configured Firebase project id");
  }

  const decodedHeader = jwt.decode(idToken, { complete: true });
  if (!decodedHeader || typeof decodedHeader === "string" || !decodedHeader.header?.kid) {
    throw new Error("Malformed ID token");
  }

  const certs = await getFirebaseCerts();
  const cert = certs[decodedHeader.header.kid as string];
  if (!cert) {
    throw new Error("Token was signed with an unrecognized key");
  }

  let payload: any;
  try {
    payload = jwt.verify(idToken, cert, {
      algorithms: ["RS256"],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    });
  } catch (err: any) {
    throw new Error("Signature verification failed: " + (err?.message || "invalid token"));
  }

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Token missing subject claim");
  }
  if (!payload.email || typeof payload.email !== "string") {
    throw new Error("Token has no email claim");
  }
  if (payload.email_verified !== true) {
    throw new Error("Google account email is not verified");
  }
  // auth_time shouldn't be in the future (basic sanity check against a
  // forged/replayed token with a doctored payload but valid-looking shape).
  if (typeof payload.auth_time === "number" && payload.auth_time > Date.now() / 1000 + 60) {
    throw new Error("Token auth_time is in the future");
  }

  return {
    uid: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}

// Exported for tests / diagnostics only.
export function _clearCertsCache() {
  certsCache = null;
}
