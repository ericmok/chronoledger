#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations, rollbackMigration, getMigrationStatus } from '../server/migrations/runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'chronoledger.sqlite');
const args = process.argv.slice(2);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

if (args.includes('--status') || args.includes('-s')) {
  const status = getMigrationStatus(db);
  console.log('\nMigration Status:');
  console.log('--------------------------------------------------');
  for (const m of status) {
    const icon = m.applied ? '✓' : ' ';
    const date = m.appliedAt ? `(applied at ${m.appliedAt})` : '(pending)';
    console.log(` [${icon}] ${m.name} ${date}`);
  }
  console.log('--------------------------------------------------\n');
} else if (args.includes('--rollback') || args.includes('-r')) {
  console.log('\nRolling back latest migration...');
  const rolledBack = rollbackMigration(db);
  if (rolledBack) {
    console.log(`✓ Rolled back: ${rolledBack.name}\n`);
  } else {
    console.log('No migrations to roll back.\n');
  }
} else {
  console.log('\nRunning pending migrations...');
  const applied = runMigrations(db);
  if (applied.length > 0) {
    console.log(
      `✓ Successfully applied ${applied.length} migration(s):\n` +
        applied.map((a) => `   - ${a.name}`).join('\n') +
        '\n'
    );
  } else {
    console.log('Database is already up to date. No pending migrations.\n');
  }
}
