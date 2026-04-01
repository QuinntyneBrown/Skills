import { getPool, getPoolMetrics } from '../config/database';
import { cacheRepository } from '../repositories/cache.repository';
import { logger } from '../utils/logger';

interface DependencyStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms: number;
  message?: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
  pool?: {
    total: number;
    idle: number;
    waiting: number;
  };
}

export class HealthCheckService {
  async checkHealth(): Promise<HealthStatus> {
    const [dbStatus, redisStatus] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const poolMetrics = await getPoolMetrics();

    const overall =
      dbStatus.status === 'unhealthy' || redisStatus.status === 'unhealthy'
        ? 'unhealthy'
        : dbStatus.status === 'degraded' || redisStatus.status === 'degraded'
          ? 'degraded'
          : 'healthy';

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      dependencies: {
        database: dbStatus,
        redis: redisStatus,
      },
      pool: {
        total: poolMetrics.totalCount,
        idle: poolMetrics.idleCount,
        waiting: poolMetrics.waitingCount,
      },
    };
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      const pool = getPool();
      await Promise.race([
        pool.query('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
      const latency = Date.now() - start;
      return {
        status: latency > 1000 ? 'degraded' : 'healthy',
        latency_ms: latency,
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        latency_ms: Date.now() - start,
        message: (err as Error).message,
      };
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      const ok = await Promise.race([
        cacheRepository.ping(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
      ]);
      const latency = Date.now() - start;
      if (!ok) {
        return { status: 'unhealthy', latency_ms: latency, message: 'Ping failed or timed out' };
      }
      return {
        status: latency > 500 ? 'degraded' : 'healthy',
        latency_ms: latency,
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        latency_ms: Date.now() - start,
        message: (err as Error).message,
      };
    }
  }
}

export const healthCheckService = new HealthCheckService();
