import { parseSQL } from '@/lib/sqlParser';

export interface OutputEntry {
  id: string;
  type: 'info' | 'error' | 'success' | 'result' | 'debug';
  message: string;
  timestamp: Date;
  line?: number;
}

const uid = () => Date.now().toString() + Math.random().toString(36).slice(2);

export const simulateSQL = (sql: string, breakpointLines?: Set<number>): OutputEntry[] => {
  const entries: OutputEntry[] = [];
  const cleanedSql = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  const statements = cleanedSql.split(';').map(s => s.trim()).filter(s => s.length > 0);

  if (statements.length === 0) {
    entries.push({ id: uid(), type: 'info', message: 'No SQL statements to execute.', timestamp: new Date() });
    return entries;
  }

  entries.push({ id: uid(), type: 'info', message: `⟩ Compiling ${statements.length} statement(s)...`, timestamp: new Date() });

  const schema = parseSQL(sql);
  if (schema.errors.length > 0) {
    schema.errors.forEach(err => {
      entries.push({ id: uid(), type: 'error', message: err, timestamp: new Date() });
    });
  }

  let hasError = schema.errors.length > 0;
  let stmtIndex = 0;
  const allLines = sql.split('\n');

  for (const stmt of statements) {
    stmtIndex++;
    const upper = stmt.toUpperCase().replace(/\s+/g, ' ').trim();
    const stmtStart = stmt.trim().slice(0, 20);
    let lineNum = allLines.findIndex(l => l.includes(stmtStart.slice(0, Math.min(15, stmtStart.length)))) + 1;

    if (breakpointLines && breakpointLines.size > 0 && lineNum > 0) {
      if (breakpointLines.has(lineNum)) {
        entries.push({ id: uid(), type: 'debug', message: `⏸ Breakpoint hit at line ${lineNum}`, timestamp: new Date(), line: lineNum });
      }
    }

    if ((stmt.match(/'/g) || []).length % 2 !== 0) {
      entries.push({ id: uid(), type: 'error', message: `ERROR [stmt ${stmtIndex}]: Unterminated string literal`, timestamp: new Date(), line: lineNum });
      hasError = true;
      continue;
    }
    const openP = (stmt.match(/\(/g) || []).length;
    const closeP = (stmt.match(/\)/g) || []).length;
    if (openP !== closeP) {
      entries.push({ id: uid(), type: 'error', message: `ERROR [stmt ${stmtIndex}]: Mismatched parentheses (${openP} open, ${closeP} close)`, timestamp: new Date(), line: lineNum });
      hasError = true;
      continue;
    }

    if (upper.startsWith('SELECT')) {
      if (upper === 'SELECT 1' || upper === 'SELECT 1 AS RESULT') {
        entries.push({ id: uid(), type: 'result', message: '┌──────────┐\n│  result  │\n├──────────┤\n│    1     │\n└──────────┘\n(1 row)', timestamp: new Date() });
      } else if (upper.startsWith('SELECT NOW()') || upper.startsWith('SELECT CURRENT_TIMESTAMP')) {
        entries.push({ id: uid(), type: 'result', message: `┌─────────────────────────────┐\n│          now()              │\n├─────────────────────────────┤\n│  ${new Date().toISOString()}  │\n└─────────────────────────────┘\n(1 row)`, timestamp: new Date() });
      } else if (upper.startsWith('SELECT VERSION()')) {
        entries.push({ id: uid(), type: 'result', message: '┌───────────────────────────────────────────┐\n│              version()                    │\n├───────────────────────────────────────────┤\n│ PostgreSQL 16.1 (PG Compiler Simulator)   │\n└───────────────────────────────────────────┘\n(1 row)', timestamp: new Date() });
      } else if (upper.includes('FROM')) {
        const tableMatch = upper.match(/FROM\s+(\w+)/);
        const tableName = tableMatch ? tableMatch[1] : 'unknown';
        entries.push({ id: uid(), type: 'error', message: `ERROR: relation "${tableName.toLowerCase()}" does not exist\nHINT: No database or tables configured.`, timestamp: new Date() });
        hasError = true;
      } else {
        entries.push({ id: uid(), type: 'result', message: `Query executed successfully. (simulated)`, timestamp: new Date() });
      }
    } else if (upper.startsWith('CREATE DATABASE')) {
      const m = upper.match(/CREATE\s+DATABASE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/);
      entries.push({ id: uid(), type: 'success', message: `✓ CREATE DATABASE "${m?.[1]?.toLowerCase() || 'unknown'}" — compiled successfully`, timestamp: new Date() });
    } else if (upper.startsWith('CREATE TABLE')) {
      const m = upper.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/);
      entries.push({ id: uid(), type: 'success', message: `✓ CREATE TABLE "${m?.[1]?.toLowerCase() || 'unknown'}" — compiled successfully`, timestamp: new Date() });
    } else if (upper.startsWith('INSERT') || upper.startsWith('UPDATE') || upper.startsWith('DELETE') || upper.startsWith('DROP')) {
      entries.push({ id: uid(), type: 'error', message: `ERROR: Cannot ${upper.split(' ')[0]} — no database connected.`, timestamp: new Date() });
      hasError = true;
    } else if (upper.startsWith('CREATE FUNCTION') || upper.startsWith('CREATE OR REPLACE')) {
      entries.push({ id: uid(), type: 'success', message: `✓ CREATE FUNCTION — compiled successfully`, timestamp: new Date() });
    } else if (upper.startsWith('ALTER') || upper.startsWith('CREATE INDEX')) {
      entries.push({ id: uid(), type: 'success', message: `✓ ${upper.split(' ').slice(0, 2).join(' ')} — compiled successfully`, timestamp: new Date() });
    } else if (upper.startsWith('BEGIN') || upper.startsWith('COMMIT') || upper.startsWith('ROLLBACK')) {
      entries.push({ id: uid(), type: 'info', message: `Transaction: ${upper.split(' ')[0]} acknowledged.`, timestamp: new Date() });
    } else {
      const knownCommands = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'BEGIN', 'COMMIT', 'ROLLBACK', 'GRANT', 'REVOKE', 'TRUNCATE', 'EXPLAIN', 'VACUUM', 'SET', 'SHOW', 'USE', 'DESCRIBE', 'COMMENT'];
      const firstWord = upper.split(' ')[0];

      if (firstWord === 'CREATE') {
        const secondWord = upper.split(' ')[1] || '';
        const validCreateTargets = ['TABLE', 'DATABASE', 'INDEX', 'VIEW', 'FUNCTION', 'TRIGGER', 'SCHEMA', 'SEQUENCE', 'TYPE', 'EXTENSION', 'ROLE', 'USER', 'OR'];
        if (!validCreateTargets.includes(secondWord)) {
          entries.push({ id: uid(), type: 'error', message: `ERROR [stmt ${stmtIndex}]: syntax error at or near "${secondWord.toLowerCase()}"\nLINE ${lineNum || stmtIndex}: ${stmt.trim()}\n     ^\nHINT: Did you mean CREATE TABLE, CREATE DATABASE, CREATE INDEX, or CREATE VIEW?`, timestamp: new Date(), line: lineNum });
          hasError = true;
        } else {
          entries.push({ id: uid(), type: 'info', message: `Parsed: ${stmt.slice(0, 80)}${stmt.length > 80 ? '...' : ''}`, timestamp: new Date() });
        }
      } else if (firstWord === 'DROP') {
        const secondWord = upper.split(' ')[1] || '';
        const validDropTargets = ['TABLE', 'DATABASE', 'INDEX', 'VIEW', 'FUNCTION', 'TRIGGER', 'SCHEMA', 'SEQUENCE', 'TYPE', 'EXTENSION', 'ROLE', 'USER'];
        if (!validDropTargets.includes(secondWord)) {
          entries.push({ id: uid(), type: 'error', message: `ERROR [stmt ${stmtIndex}]: syntax error at or near "${secondWord.toLowerCase()}"\nLINE ${lineNum || stmtIndex}: ${stmt.trim()}\n     ^\nHINT: Did you mean DROP TABLE, DROP DATABASE, or DROP INDEX?`, timestamp: new Date(), line: lineNum });
          hasError = true;
        } else {
          entries.push({ id: uid(), type: 'success', message: `✓ ${upper.split(' ').slice(0, 2).join(' ')} — compiled successfully`, timestamp: new Date() });
        }
      } else if (!knownCommands.includes(firstWord)) {
        entries.push({ id: uid(), type: 'error', message: `ERROR [stmt ${stmtIndex}]: syntax error at or near "${firstWord.toLowerCase()}"\nLINE ${lineNum || stmtIndex}: ${stmt.trim()}\n     ^\nHINT: Unrecognized command "${firstWord.toLowerCase()}". Check for typos.`, timestamp: new Date(), line: lineNum });
        hasError = true;
      } else {
        entries.push({ id: uid(), type: 'info', message: `Parsed: ${stmt.slice(0, 80)}${stmt.length > 80 ? '...' : ''}`, timestamp: new Date() });
      }
    }
  }

  const errorCount = entries.filter(e => e.type === 'error').length;
  const successCount = entries.filter(e => e.type === 'success').length;

  if (hasError) {
    entries.push({ id: uid(), type: 'error', message: `\n✗ Compilation FAILED — ${errorCount} error(s) found`, timestamp: new Date() });
  } else {
    entries.push({ id: uid(), type: 'success', message: `\n✓ Compilation successful — ${successCount} statement(s) compiled at ${new Date().toLocaleTimeString()}`, timestamp: new Date() });
  }

  return entries;
};

/**
 * Get only the meaningful output lines (success/result/error messages, no meta info like "Compiling..." or summary)
 */
export const getOutputText = (entries: OutputEntry[]): string => {
  return entries
    .filter(e => e.type === 'success' || e.type === 'result' || e.type === 'error')
    .map(e => e.message.trim())
    .join('\n')
    .trim();
};

/**
 * Calculate similarity percentage between two strings (line-by-line)
 */
export const calculateMatchPercentage = (expected: string, actual: string): number => {
  if (!expected && !actual) return 100;
  if (!expected || !actual) return 0;
  
  const expLines = expected.trim().split('\n').map(l => l.trim().toLowerCase()).filter(Boolean);
  const actLines = actual.trim().split('\n').map(l => l.trim().toLowerCase()).filter(Boolean);
  
  if (expLines.length === 0) return actLines.length === 0 ? 100 : 0;
  
  let matched = 0;
  for (const expLine of expLines) {
    if (actLines.some(al => al === expLine)) {
      matched++;
    }
  }
  
  return Math.round((matched / expLines.length) * 100);
};
