import fs from 'node:fs';
import path from 'node:path';
import {
  BoxClient,
  BoxDeveloperTokenAuth,
  BoxJwtAuth,
  JwtConfig,
} from 'box-node-sdk';

export interface BoxTokenData {
  accessToken: string;
  tokenType?: string;
  expiresIn?: number;
  acquiredAt?: number;
}

export interface BoxAuthOptions {
  clientId?: string;
  clientSecret?: string;
  enterpriseId?: string;
  privateKey?: string;
  passphrase?: string;
  publicKeyId?: string;
  tokenFilePath?: string;
  directToken?: string;
}

class BoxClientManager {
  private static instance: BoxClientManager | null = null;
  private client: BoxClient | null = null;
  private jwtAuth: BoxJwtAuth | null = null;
  private tokenFilePath: string;

  private constructor() {
    this.tokenFilePath =
      process.env.BOX_TOKEN_FILE ||
      path.resolve(process.cwd(), 'credentials', 'box-token.json');
  }

  public static getInstance(): BoxClientManager {
    if (!BoxClientManager.instance) {
      BoxClientManager.instance = new BoxClientManager();
    }
    return BoxClientManager.instance;
  }

  /**
   * Resets the singleton instance (useful in tests).
   */
  public static resetInstance(): void {
    BoxClientManager.instance = null;
  }

  /**
   * Attempts to load saved access token from credentials/box-token.json.
   */
  public getStoredToken(): BoxTokenData | null {
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const raw = fs.readFileSync(this.tokenFilePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data.accessToken === 'string' && data.accessToken.trim()) {
          return data as BoxTokenData;
        }
      }
    } catch (err) {
      console.error(`[BoxClient] Warning: Failed to read token file: ${(err as Error).message}`);
    }
    return null;
  }

  /**
   * Saves access token data to credentials/box-token.json.
   */
  public saveStoredToken(tokenData: BoxTokenData): void {
    try {
      const dir = path.dirname(this.tokenFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(
        this.tokenFilePath,
        JSON.stringify(
          {
            ...tokenData,
            acquiredAt: tokenData.acquiredAt || Date.now(),
          },
          null,
          2
        ),
        { encoding: 'utf-8', mode: 0o600 }
      );
    } catch (err) {
      console.error(`[BoxClient] Warning: Failed to save token file: ${(err as Error).message}`);
    }
  }

  /**
   * Initializes JWT configuration from environment variables or explicit options.
   */
  private createJwtConfig(options?: BoxAuthOptions): JwtConfig {
    const configFile = process.env.BOX_CONFIG_FILE;
    if (configFile && fs.existsSync(configFile)) {
      const configJsonStr = fs.readFileSync(configFile, 'utf-8');
      return JwtConfig.fromConfigJsonString(configJsonStr);
    }

    const clientId = options?.clientId || process.env.BOX_CLIENT_ID;
    const clientSecret = options?.clientSecret || process.env.BOX_CLIENT_SECRET;
    const enterpriseId = options?.enterpriseId || process.env.BOX_ENTERPRISE_ID;
    let privateKey = options?.privateKey || process.env.BOX_PRIVATE_KEY;
    const passphrase = options?.passphrase || process.env.BOX_PRIVATE_KEY_PASSPHRASE || '';
    const publicKeyId = options?.publicKeyId || process.env.BOX_PUBLIC_KEY_ID || '';

    if (!clientId || !clientSecret || !enterpriseId || !privateKey) {
      throw new Error(
        'Missing Box JWT Credentials. Ensure BOX_CLIENT_ID, BOX_CLIENT_SECRET, BOX_ENTERPRISE_ID, and BOX_PRIVATE_KEY are set.'
      );
    }

    // Unescape newlines if private key is passed as a single line string in env
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    return new JwtConfig({
      clientId,
      clientSecret,
      enterpriseId,
      jwtKeyId: publicKeyId,
      privateKey,
      privateKeyPassphrase: passphrase,
    });
  }

  /**
   * Builds or returns an authenticated BoxClient instance.
   */
  public async getClient(options?: BoxAuthOptions): Promise<BoxClient> {
    if (this.client) {
      return this.client;
    }

    // 1. Direct developer token via env or options
    const directToken = options?.directToken || process.env.BOX_ACCESS_TOKEN || process.env.BOX_DEVELOPER_TOKEN;
    if (directToken) {
      const auth = new BoxDeveloperTokenAuth({ token: directToken });
      this.client = new BoxClient({ auth });
      return this.client;
    }

    // 2. Token stored in credentials/box-token.json
    const stored = this.getStoredToken();
    if (stored?.accessToken) {
      // Check expiry if acquiredAt and expiresIn exist
      const isExpired =
        stored.acquiredAt && stored.expiresIn
          ? Date.now() > stored.acquiredAt + stored.expiresIn * 1000 - 60000
          : false;

      if (!isExpired) {
        const auth = new BoxDeveloperTokenAuth({ token: stored.accessToken });
        this.client = new BoxClient({ auth });
        return this.client;
      }
    }

    // 3. JWT Authentication Exchange
    const jwtConfig = this.createJwtConfig(options);
    this.jwtAuth = new BoxJwtAuth({ config: jwtConfig });

    const enterpriseId = options?.enterpriseId || process.env.BOX_ENTERPRISE_ID;
    const tokenObj = await this.jwtAuth.withEnterpriseSubject(enterpriseId!).retrieveToken();

    if (tokenObj?.accessToken) {
      this.saveStoredToken({
        accessToken: tokenObj.accessToken,
        tokenType: tokenObj.tokenType,
        expiresIn: tokenObj.expiresIn,
        acquiredAt: Date.now(),
      });
    }

    this.client = new BoxClient({ auth: this.jwtAuth });
    return this.client;
  }

  /**
   * Exchanges JWT credentials and writes token to disk.
   */
  public async exchangeAndSaveTokens(options?: BoxAuthOptions): Promise<BoxTokenData> {
    const jwtConfig = this.createJwtConfig(options);
    const jwtAuth = new BoxJwtAuth({ config: jwtConfig });
    const enterpriseId = options?.enterpriseId || process.env.BOX_ENTERPRISE_ID;

    const tokenObj = await jwtAuth.withEnterpriseSubject(enterpriseId!).retrieveToken();
    const tokenData: BoxTokenData = {
      accessToken: tokenObj.accessToken!,
      tokenType: tokenObj.tokenType,
      expiresIn: tokenObj.expiresIn,
      acquiredAt: Date.now(),
    };

    this.saveStoredToken(tokenData);
    return tokenData;
  }
}

/**
 * Convenience helper to obtain the singleton authenticated BoxClient.
 */
export async function getBoxClient(options?: BoxAuthOptions): Promise<BoxClient> {
  return BoxClientManager.getInstance().getClient(options);
}

export { BoxClientManager };
