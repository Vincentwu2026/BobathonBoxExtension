#!/usr/bin/env node
/**
 * CLI Script: Exchange Box JWT Credentials for an Access Token
 * Saves the token securely in credentials/box-token.json
 */

import { BoxClientManager } from '../src/box-client.js';

async function main() {
  console.error('[GetTokens] Starting Box JWT Authentication token exchange...');

  const clientId = process.env.BOX_CLIENT_ID;
  const clientSecret = process.env.BOX_CLIENT_SECRET;
  const enterpriseId = process.env.BOX_ENTERPRISE_ID;
  const privateKey = process.env.BOX_PRIVATE_KEY;
  const configFile = process.env.BOX_CONFIG_FILE;

  if (!configFile && (!clientId || !clientSecret || !enterpriseId || !privateKey)) {
    console.error('[GetTokens] Error: Missing required Box credentials in environment.');
    console.error('Please set BOX_CLIENT_ID, BOX_CLIENT_SECRET, BOX_ENTERPRISE_ID, and BOX_PRIVATE_KEY,');
    console.error('or set BOX_CONFIG_FILE to the path of your Box JSON config file.');
    process.exit(1);
  }

  try {
    const manager = BoxClientManager.getInstance();
    const tokenData = await manager.exchangeAndSaveTokens();

    console.error('[GetTokens] Successfully authenticated with Box Enterprise!');
    console.error(`[GetTokens] Token Type: ${tokenData.tokenType || 'Bearer'}`);
    console.error(`[GetTokens] Expires In: ${tokenData.expiresIn || 3600} seconds`);
    console.error('[GetTokens] Token written securely to credentials/box-token.json');
  } catch (error: any) {
    console.error(`[GetTokens] Failed to exchange Box JWT token: ${error?.message || error}`);
    if (error?.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[GetTokens] Unexpected fatal error:', err);
  process.exit(1);
});
