import * as fs from 'fs';
import * as path from 'path';
import { getPool, closePool } from '../config/database';
import { logger } from '../utils/logger';

const SQL_DIR = path.join(__dirname, 'sql');

async function ensureMigrationsTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

function getMigrationFiles(direction: 'up' | 'down'): string[] {
  const suffix = direction === 'up' ? '.up.sql' : '.down.sql';
  return fs
    .readdirSync(SQL_DIR)
    .filter((f) => f.endsWith(suffix))
    .sort();
}

function extractVersion(filename: string): string {
  // e.g. "001_initial_schema.up.sql" -> "001_initial_schema"
  return filename.replace(/\.(up|down)\.sql$/, '');
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const pool = getPool();
  const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  return new Set(result.rows.map((r: { version: string }) => r.version));
}

async function applyMigration(version: string, filename: string): Promise<void> {
  const filePath = path.join(SQL_DIR, filename);
  const sql = fs.readFileSync(filePath, 'utf-8');
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    await client.query('COMMIT');
    logger.info('Migration applied', { version, file: filename });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration failed', {
      version,
      file: filename,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    client.release();
  }
}

async function rollbackMigration(version: string, filename: string): Promise<void> {
  const filePath = path.join(SQL_DIR, filename);
  const sql = fs.readFileSync(filePath, 'utf-8');
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
    await client.query('COMMIT');
    logger.info('Migration rolled back', { version, file: filename });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Rollback failed', {
      version,
      file: filename,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    client.release();
  }
}

async function migrate(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const upFiles = getMigrationFiles('up');
  let appliedCount = 0;

  for (const file of upFiles) {
    const version = extractVersion(file);
    if (applied.has(version)) {
      logger.debug('Skipping already applied migration', { version });
      continue;
    }
    await applyMigration(version, file);
    appliedCount++;
  }

  if (appliedCount === 0) {
    logger.info('No new migrations to apply');
  } else {
    logger.info('Migrations complete', { applied: appliedCount });
  }
}

async function rollback(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  if (applied.size === 0) {
    logger.info('No migrations to roll back');
    return;
  }

  // Get the last applied migration
  const lastVersion = Array.from(applied).sort().pop()!;
  const downFile = `${lastVersion}.down.sql`;
  const downPath = path.join(SQL_DIR, downFile);

  if (!fs.existsSync(downPath)) {
    logger.error('No down migration found', { version: lastVersion, expected: downFile });
    throw new Error(`Down migration not found: ${downFile}`);
  }

  await rollbackMigration(lastVersion, downFile);
  logger.info('Rollback complete', { version: lastVersion });
}

async function main(): Promise<void> {
  const command = process.argv[2];

  try {
    if (command === 'rollback') {
      logger.info('Starting migration rollback');
      await rollback();
    } else {
      logger.info('Starting migrations');
      await migrate();
    }
  } catch (err) {
    logger.fatal('Migration runner failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

main();
