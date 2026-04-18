import fs from 'fs/promises';
import path from 'path';
import type { GatewayCredentials } from './types';

export class TokenExpiredError extends Error {
  constructor(message: string = 'Token expired') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export class ConfigAdapter {
  private credentialsCache: Map<string, GatewayCredentials> = new Map();

  constructor(private configPath: string) {}

  async getCredentials(service: 'gateway'): Promise<GatewayCredentials> {
    // Check cache first
    const cached = this.credentialsCache.get(service);
    if (cached && !this.isExpired(cached)) {
      return cached;
    }

    // Try to load from file
    const filePath = path.join(this.configPath, `${service}-credentials.json`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const credentials = JSON.parse(content) as GatewayCredentials;

      if (this.isExpired(credentials)) {
        throw new TokenExpiredError(`Token for ${service} expired at ${new Date(credentials.expiresAtMs).toISOString()}`);
      }

      this.credentialsCache.set(service, credentials);
      return credentials;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' || err instanceof SyntaxError) {
        // Fall back to environment variable
        const envToken = process.env.OPENCLAW_GATEWAY_TOKEN;
        if (envToken) {
          const envCredentials: GatewayCredentials = {
            deviceId: process.env.OPENCLAW_DEVICE_ID || 'unknown',
            token: envToken,
            scope: ['operator.write', 'gateway.trigger'],
            updatedAtMs: Date.now(),
            expiresAtMs: Date.now() + 3600000
          };
          this.credentialsCache.set(service, envCredentials);
          return envCredentials;
        }
      }
      throw err;
    }
  }

  async refreshCredentials(service: 'gateway'): Promise<GatewayCredentials> {
    this.credentialsCache.delete(service);
    return this.getCredentials(service);
  }

  private isExpired(credentials: GatewayCredentials): boolean {
    return credentials.expiresAtMs < Date.now();
  }
}