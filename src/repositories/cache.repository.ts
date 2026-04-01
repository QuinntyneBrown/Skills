import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

export class CacheRepository {
  private get redis() {
    return getRedis();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (err) {
      logger.warn('Cache get failed', { key, error: (err as Error).message });
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      logger.warn('Cache set failed', { key, error: (err as Error).message });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      logger.warn('Cache delete failed', { key, error: (err as Error).message });
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    try {
      const stream = this.redis.scanStream({ match: pattern, count: 100 });
      const pipeline = this.redis.pipeline();
      let count = 0;

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (keys: string[]) => {
          for (const key of keys) {
            pipeline.del(key);
            count++;
          }
        });
        stream.on('end', () => resolve());
        stream.on('error', (err) => reject(err));
      });

      if (count > 0) await pipeline.exec();
    } catch (err) {
      logger.warn('Cache deletePattern failed', { pattern, error: (err as Error).message });
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

export const cacheRepository = new CacheRepository();
