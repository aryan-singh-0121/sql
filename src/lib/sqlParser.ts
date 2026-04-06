// SQL Schema Parser — extracts databases, tables, and columns from SQL content

export interface ParsedColumn {
  name: string;
  type: string;
  constraints: string[];
}

export interface ParsedTable {
  name: string;
  columns: ParsedColumn[];
}

export interface ParsedDatabase {
  name: string;
}

export interface ParsedSchema {
  databases: ParsedDatabase[];
  tables: ParsedTable[];
  errors: string[];
}

export const parseSQL = (sql: string): ParsedSchema => {
  const databases: ParsedDatabase[] = [];
  const tables: ParsedTable[] = [];
  const errors: string[] = [];
  const seenDatabases = new Set<string>();
  const seenTables = new Set<string>();

  // Strip comments
  const cleaned = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  const statements = cleaned.split(';').map(s => s.trim()).filter(s => s.length > 0);

  for (const stmt of statements) {
    const upper = stmt.toUpperCase().replace(/\s+/g, ' ').trim();

    // CREATE DATABASE
    const dbMatch = upper.match(/^CREATE\s+DATABASE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    if (dbMatch) {
      const name = dbMatch[1].toLowerCase();
      if (seenDatabases.has(name)) {
        errors.push(`ERROR: database "${name}" already exists in this file`);
      } else {
        seenDatabases.add(name);
        databases.push({ name });
      }
      continue;
    }

    // CREATE TABLE
    const tableMatch = upper.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    if (tableMatch) {
      const tableName = tableMatch[1].toLowerCase();
      if (seenTables.has(tableName)) {
        errors.push(`ERROR: relation "${tableName}" already exists in this file`);
      } else {
        seenTables.add(tableName);
        const columns = parseColumns(stmt);
        tables.push({ name: tableName, columns });
      }
    }
  }

  return { databases, tables, errors };
};

const parseColumns = (createStmt: string): ParsedColumn[] => {
  const columns: ParsedColumn[] = [];
  
  // Extract content between first ( and last )
  const openIdx = createStmt.indexOf('(');
  const closeIdx = createStmt.lastIndexOf(')');
  if (openIdx === -1 || closeIdx === -1) return columns;

  const body = createStmt.slice(openIdx + 1, closeIdx).trim();
  
  // Split by comma, but be careful about nested parentheses
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());

  const constraintKeywords = ['PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'CONSTRAINT', 'INDEX'];

  for (const part of parts) {
    const upper = part.toUpperCase().trim();
    // Skip table-level constraints
    if (constraintKeywords.some(k => upper.startsWith(k))) continue;

    const tokens = part.trim().split(/\s+/);
    if (tokens.length < 2) continue;

    const name = tokens[0].replace(/"/g, '').toLowerCase();
    const type = tokens[1].toUpperCase();
    const rest = tokens.slice(2).join(' ').toUpperCase();
    
    const constraints: string[] = [];
    if (rest.includes('PRIMARY KEY')) constraints.push('PK');
    if (rest.includes('NOT NULL')) constraints.push('NOT NULL');
    if (rest.includes('UNIQUE')) constraints.push('UNIQUE');
    if (rest.includes('DEFAULT')) constraints.push('DEFAULT');
    if (rest.includes('REFERENCES')) constraints.push('FK');
    if (upper.includes('SERIAL') || upper.includes('BIGSERIAL')) constraints.push('AUTO');

    columns.push({ name, type, constraints });
  }

  return columns;
};
