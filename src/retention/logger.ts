import fs from 'node:fs';
import path from 'node:path';

export interface RetentionLogEntry {
  timestamp: string;
  fileId: string;
  decision: 'PROTECTED' | 'DELETED' | 'BLOCKED' | 'POLICY_SET' | 'CHECKED';
  reason: string;
  details?: Record<string, any>;
}

export class RetentionLogger {
  private static logFilePath: string;

  public static getLogPath(): string {
    if (!RetentionLogger.logFilePath) {
      RetentionLogger.logFilePath =
        process.env.BOX_RETENTION_LOG ||
        path.resolve(process.cwd(), 'data', 'retention-log.jsonl');
    }
    return RetentionLogger.logFilePath;
  }

  public static setLogPath(customPath: string): void {
    RetentionLogger.logFilePath = customPath;
  }

  /**
   * Appends an audit entry to the retention JSONL log file.
   */
  public static log(entry: Omit<RetentionLogEntry, 'timestamp'> & { timestamp?: string }): RetentionLogEntry {
    const fullEntry: RetentionLogEntry = {
      timestamp: entry.timestamp || new Date().toISOString(),
      fileId: entry.fileId,
      decision: entry.decision,
      reason: entry.reason,
      ...(entry.details ? { details: entry.details } : {}),
    };

    const filePath = RetentionLogger.getLogPath();
    const dir = path.dirname(filePath);

    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const line = JSON.stringify(fullEntry) + '\n';
      fs.appendFileSync(filePath, line, { encoding: 'utf-8' });
    } catch (err: any) {
      console.error(`[RetentionLogger] Failed to write log entry: ${err?.message || err}`);
    }

    return fullEntry;
  }

  /**
   * Reads recent retention log entries for audit purposes.
   */
  public static readLogs(limit = 100): RetentionLogEntry[] {
    const filePath = RetentionLogger.getLogPath();
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l.trim().length > 0);
      const entries: RetentionLogEntry[] = [];

      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // ignore malformed line
        }
      }

      return entries.slice(-limit).reverse();
    } catch (err: any) {
      console.error(`[RetentionLogger] Failed to read logs: ${err?.message || err}`);
      return [];
    }
  }
}
