# Database Migrations

Chronoledger utilizes a zero-dependency, file-per-version migration engine located in `server/migrations/`.

## Architecture Overview

- **Table Ledger (`_migrations`)**: Tracks applied migrations by their 4-digit ID and filename with timestamps.
- **Atomic Transactions**: Every migration runs inside `BEGIN TRANSACTION;` and `COMMIT;`. If any error occurs, the runner issues an immediate `ROLLBACK;`.
- **Squashed Baseline**: `0001_baseline_v8.js` represents the canonical Schema v8 baseline. Existing v8 databases automatically register the baseline without re-running DDL.

---

## Authoring a Migration

1. Create a new JavaScript file in `server/migrations/` using a **4-digit sequential prefix**:
   ```text
   0002_add_user_timezone.js
   0003_create_tags_table.js
   ```

2. Export both an `up(db)` and `down(db)` function:
   ```javascript
   /**
    * Migration 0002: Add User Timezone Setting
    */

   export function up(db) {
     db.exec(`
       ALTER TABLE settings ADD COLUMN timezone TEXT DEFAULT 'UTC';
     `);
   }

   export function down(db) {
     db.exec(`
       ALTER TABLE settings DROP COLUMN timezone;
     `);
   }
   ```

3. **Defensive Rules**:
   - **Views**: Always `DROP VIEW IF EXISTS ...` before modifying or dropping a table referenced by a view, and recreate the view afterward.
   - **Idempotency**: Use `IF NOT EXISTS` where appropriate.
   - **Rollbacks**: Ensure `down(db)` reverses the exact operations of `up(db)`.

---

## CLI Commands

You can run migrations, check status, or roll back directly using npm scripts:

```bash
# Check status of all migrations (applied vs pending)
npm run migrate:status

# Run all pending migrations
npm run migrate

# Roll back the most recently applied migration
npm run migrate:rollback
```
