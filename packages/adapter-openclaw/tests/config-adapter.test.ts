import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigAdapter, TokenExpiredError } from '../src/config-adapter';
import fs from 'fs/promises';
import path from 'path';

vi.mock('fs/promises');

describe('ConfigAdapter', () => {
  let configAdapter: ConfigAdapter;
  const testConfigPath = '/test/config';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENCLAW_GATEWAY_TOKEN = '';
    process.env.OPENCLAW_DEVICE_ID = '';
    configAdapter = new ConfigAdapter(testConfigPath);
  });

  afterEach(() => {
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
    delete process.env.OPENCLAW_DEVICE_ID;
  });

  describe('getCredentials', () => {
    it('should load valid credentials from file', async () => {
      const mockCredentials = {
        deviceId: 'test-device',
        token: 'test-token',
        scope: ['operator.write', 'gateway.trigger'],
        updatedAtMs: Date.now(),
        expiresAtMs: Date.now() + 3600000
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockCredentials));

      const result = await configAdapter.getCredentials('gateway');

      expect(result.token).toBe('test-token');
      expect(result.deviceId).toBe('test-device');
    });

    it('should throw TokenExpiredError for expired tokens', async () => {
      const expiredCredentials = {
        deviceId: 'test-device',
        token: 'test-token',
        scope: ['operator.write'],
        updatedAtMs: Date.now() - 7200000,
        expiresAtMs: Date.now() - 3600000
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(expiredCredentials));

      await expect(configAdapter.getCredentials('gateway')).rejects.toThrow(TokenExpiredError);
    });

    it('should fall back to environment variable when file not found', async () => {
      process.env.OPENCLAW_GATEWAY_TOKEN = 'env-token';
      process.env.OPENCLAW_DEVICE_ID = 'env-device';

      vi.mocked(fs.readFile).mockRejectedValue(Object.assign(new Error('File not found'), { code: 'ENOENT' }));

      const result = await configAdapter.getCredentials('gateway');

      expect(result.token).toBe('env-token');
      expect(result.deviceId).toBe('env-device');
    });

    it('should cache credentials', async () => {
      const mockCredentials = {
        deviceId: 'test-device',
        token: 'test-token',
        scope: ['operator.write', 'gateway.trigger'],
        updatedAtMs: Date.now(),
        expiresAtMs: Date.now() + 3600000
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockCredentials));

      await configAdapter.getCredentials('gateway');
      await configAdapter.getCredentials('gateway');

      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });
  });
});