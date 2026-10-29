import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface IndexedFileRecord {
  box_id: string;
  name: string;
  path: string;
  owner_email: string;
  collaborators: string;
  content_preview: string;
  last_modified: string;
  indexed_at: string;
}

export interface SearchResultItem extends IndexedFileRecord {
  rank?: number;
  snippet?: string;
  url: string;
}

let dbInstance: DatabaseSync | null = null;

export function getDatabasePath(): string {
  const customPath = process.env.BOX_DB_PATH;
  if (customPath) {
    return path.resolve(customPath);
  }
  return path.resolve(process.cwd(), 'data', 'box_index.db');
}

/**
 * Initializes the SQLite database with the files table and FTS5 virtual table.
 */
export function getDatabase(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = getDatabasePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // Enable WAL mode for high-concurrency read/write
  try {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  } catch (err) {
    // Non-fatal if PRAGMA is restricted
  }

  // Primary structured table
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      box_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      owner_email TEXT,
      collaborators TEXT,
      content_preview TEXT,
      last_modified TEXT,
      indexed_at TEXT NOT NULL
    );
  `);

  // Secondary indices on files
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
    CREATE INDEX IF NOT EXISTS idx_files_last_modified ON files(last_modified);
    CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_email);
  `);

  // Full-Text Search (FTS5) virtual table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      box_id UNINDEXED,
      name,
      path,
      owner_email,
      collaborators,
      content_preview,
      last_modified UNINDEXED,
      indexed_at UNINDEXED,
      content='files',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );
  `);

  // Triggers to keep FTS5 synchronized with main files table
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
      INSERT INTO files_fts(rowid, box_id, name, path, owner_email, collaborators, content_preview, last_modified, indexed_at)
      VALUES (new.rowid, new.box_id, new.name, new.path, new.owner_email, new.collaborators, new.content_preview, new.last_modified, new.indexed_at);
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, box_id, name, path, owner_email, collaborators, content_preview, last_modified, indexed_at)
      VALUES('delete', old.rowid, old.box_id, old.name, old.path, old.owner_email, old.collaborators, old.content_preview, old.last_modified, old.indexed_at);
    END;
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, box_id, name, path, owner_email, collaborators, content_preview, last_modified, indexed_at)
      VALUES('delete', old.rowid, old.box_id, old.name, old.path, old.owner_email, old.collaborators, old.content_preview, old.last_modified, old.indexed_at);
      INSERT INTO files_fts(rowid, box_id, name, path, owner_email, collaborators, content_preview, last_modified, indexed_at)
      VALUES (new.rowid, new.box_id, new.name, new.path, new.owner_email, new.collaborators, new.content_preview, new.last_modified, new.indexed_at);
    END;
  `);

  dbInstance = db;
  return dbInstance;
}

/**
 * Upsert a file record into the SQLite index.
 */
export function upsertFileRecord(record: IndexedFileRecord): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO files (box_id, name, path, owner_email, collaborators, content_preview, last_modified, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(box_id) DO UPDATE SET
      name = excluded.name,
      path = excluded.path,
      owner_email = excluded.owner_email,
      collaborators = excluded.collaborators,
      content_preview = excluded.content_preview,
      last_modified = excluded.last_modified,
      indexed_at = excluded.indexed_at;
  `);

  stmt.run(
    record.box_id,
    record.name,
    record.path,
    record.owner_email || '',
    record.collaborators || '',
    record.content_preview || '',
    record.last_modified || '',
    record.indexed_at
  );
}

/**
 * Fetches an existing file record by box_id.
 */
export function getFileRecord(boxId: string): IndexedFileRecord | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM files WHERE box_id = ? LIMIT 1');
  const result = stmt.get(boxId) as unknown as IndexedFileRecord | undefined;
  return result || null;
}

/**
 * Removes a file record (and, through the trigger, its search entry). Local index only.
 */
export function deleteFileRecord(boxId: string): void {
  getDatabase().prepare('DELETE FROM files WHERE box_id = ?').run(boxId);
}

/**
 * Close database connection (useful during clean shutdown / tests).
 */
export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (err) {
      // Ignore
    }
    dbInstance = null;
  }
}
