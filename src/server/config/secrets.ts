// Central source of truth for security-critical secrets.
//
// Previously JWT_SECRET was defined independently in three places
// (server.ts, controllers/auth.ts, middleware/auth.ts), each falling
// back to a hardcoded string ("jtg-panel-super-secret" /
// "proto-panel-super-secret") if the env var was missing. Those
// fallback strings are public (they're sitting in this source file's
// history), so any deployment that forgot to set JWT_SECRET was
// trivially forgeable — anyone could mint a token with role: "owner".
//
// install.sh already generates a random JWT_SECRET on install. This
// module makes the app fail loudly at startup if that secret is ever
// missing at runtime, instead of silently degrading to a guessable
// default.

function loadJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;

  if (!fromEnv || !fromEnv.trim()) {
    // eslint-disable-next-line no-console
    console.error(
      "\n[FATAL] JWT_SECRET is not set.\n" +
      "Proto Panel refuses to start without it — running with a default\n" +
      "secret would let anyone forge admin tokens.\n\n" +
      "Fix: set JWT_SECRET in your .env file to a long random value, e.g.\n" +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n" +
      "(install.sh generates this automatically for new installs.)\n"
    );
    process.exit(1);
  }

  if (fromEnv.length < 32) {
    // eslint-disable-next-line no-console
    console.warn(
      "[WARN] JWT_SECRET is shorter than the recommended 32 characters. " +
      "Consider regenerating it with a longer random value."
    );
  }

  return fromEnv;
}

export const JWT_SECRET: string = loadJwtSecret();
