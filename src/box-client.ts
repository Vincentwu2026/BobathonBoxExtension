/**
 * src/box-client.ts
 *
 * Singleton Box client factory using box-node-sdk v10 (JWT app auth).
 *
 * Authentication priority:
 *   1. Environment variables (BOX_CLIENT_ID, BOX_CLIENT_SECRET, BOX_ENTERPRISE_ID,
 *      BOX_PRIVATE_KEY, BOX_PRIVATE_KEY_ID, BOX_PASSPHRASE)
 *   2. credentials/box-token.json written by scripts/get-tokens.ts
 *
 * All secrets are read at runtime — nothing is hardcoded here.
 */

import { BoxClient, BoxJwtAuth, BoxDeveloperTokenAuth, JwtConfig } from "box-node-sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.resolve(__dirname, "../credentials/box-token.json");

let _client: BoxClient | null = null;

export function getBoxClient(): BoxClient {
  if (_client) return _client;

  const clientId = process.env["BOX_CLIENT_ID"];
  const clientSecret = process.env["BOX_CLIENT_SECRET"];
  const enterpriseId = process.env["BOX_ENTERPRISE_ID"];
  const privateKeyRaw = process.env["BOX_PRIVATE_KEY"];
  const keyId = process.env["BOX_PRIVATE_KEY_ID"];

  if (clientId && clientSecret && enterpriseId && privateKeyRaw && keyId) {
    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
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
    _client = new BoxClient({ auth });
    return _client;
  }

  // Fall back to token file written by get-tokens script
  if (fs.existsSync(TOKEN_FILE)) {
    const raw = fs.readFileSync(TOKEN_FILE, "utf8");
    const payload = JSON.parse(raw) as { access_token: string };

    const auth = new BoxDeveloperTokenAuth({ token: payload.access_token });
    _client = new BoxClient({ auth });
    return _client;
  }

  throw new Error(
    "[box-client] No Box credentials found. Set BOX_CLIENT_ID, BOX_CLIENT_SECRET, " +
      "BOX_ENTERPRISE_ID, BOX_PRIVATE_KEY, BOX_PRIVATE_KEY_ID env vars, " +
      "or run `npm run get-tokens` first."
  );
}
