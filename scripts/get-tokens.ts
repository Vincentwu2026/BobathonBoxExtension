/**
 * scripts/get-tokens.ts
 *
 * One-time script: exchanges Box JWT app credentials for a service-account
 * access token and writes it to credentials/box-token.json (gitignored).
 *
 * Required environment variables:
 *   BOX_CLIENT_ID       — OAuth 2.0 client ID from the Box app
 *   BOX_CLIENT_SECRET   — OAuth 2.0 client secret
 *   BOX_ENTERPRISE_ID   — Box enterprise / organization ID
 *   BOX_PRIVATE_KEY     — PEM-encoded RSA private key (newlines as \n)
 *   BOX_PRIVATE_KEY_ID  — Key ID registered in the Box app
 *   BOX_PASSPHRASE      — Passphrase for the private key (if set, else leave unset)
 *
 * Usage:
 *   BOX_CLIENT_ID=xxx BOX_CLIENT_SECRET=yyy ... npm run get-tokens
 */

import { BoxJwtAuth, BoxClient, JwtConfig } from "box-node-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_DIR = path.resolve(__dirname, "../credentials");
const TOKEN_FILE = path.join(CREDENTIALS_DIR, "box-token.json");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[get-tokens] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const clientId = requireEnv("BOX_CLIENT_ID");
const clientSecret = requireEnv("BOX_CLIENT_SECRET");
const enterpriseId = requireEnv("BOX_ENTERPRISE_ID");
const privateKey = requireEnv("BOX_PRIVATE_KEY").replace(/\\n/g, "\n");
const keyId = requireEnv("BOX_PRIVATE_KEY_ID");
const passphrase = process.env["BOX_PASSPHRASE"] ?? "";

const config = new JwtConfig({
  clientId,
  clientSecret,
  jwtKeyId: keyId,
  privateKey,
  privateKeyPassphrase: passphrase,
  enterpriseId,
});

const auth = new BoxJwtAuth({ config });
const client = new BoxClient({ auth });

// Trigger an API call to obtain and cache the token
client.users.getMe({}).then((me) => {
  // Retrieve the token via the auth object
  auth.retrieveToken(null).then((tokenInfo) => {
    const payload = {
      access_token: tokenInfo.accessToken,
      enterprise_id: enterpriseId,
      service_account_id: me.id,
      service_account_login: me.login,
      obtained_at: new Date().toISOString(),
    };

    if (!fs.existsSync(CREDENTIALS_DIR)) {
      fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
    }

    fs.writeFileSync(TOKEN_FILE, JSON.stringify(payload, null, 2), "utf8");
    console.error(`[get-tokens] Token written to ${TOKEN_FILE}`);
    console.error(`[get-tokens] Service account: ${me.login} (${me.id})`);
  });
}).catch((err: unknown) => {
  console.error("[get-tokens] Failed to obtain token:", err);
  process.exit(1);
});
