import { cacheRepository } from '../repositories/cache.repository';
import { config } from '../config/index';

export class CacheService {
  async getSkill<T>(id: string): Promise<T | null> {
    return cacheRepository.get<T>(`skill:${id}`);
  }

  async setSkill(id: string, data: any): Promise<void> {
    await cacheRepository.set(`skill:${id}`, data, config.cache.skillTtl);
  }

  async getList<T>(queryHash: string): Promise<T | null> {
    return cacheRepository.get<T>(`skill:list:${queryHash}`);
  }

  async setList(queryHash: string, data: any): Promise<void> {
    await cacheRepository.set(`skill:list:${queryHash}`, data, config.cache.listTtl);
  }

  async getSearch<T>(queryHash: string): Promise<T | null> {
    return cacheRepository.get<T>(`skill:search:${queryHash}`);
  }

  async setSearch(queryHash: string, data: any): Promise<void> {
    await cacheRepository.set(`skill:search:${queryHash}`, data, config.cache.searchTtl);
  }

  async invalidateSkill(id: string): Promise<void> {
    await cacheRepository.delete(`skill:${id}`);
    await cacheRepository.deletePattern('skill:list:*');
    await cacheRepository.deletePattern('skill:search:*');
  }

  async invalidateAll(): Promise<void> {
    await cacheRepository.deletePattern('skill:*');
  }
}

export const cacheService = new CacheService();
