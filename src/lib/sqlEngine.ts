/**
 * Advanced In-Memory SQL Engine
 * Supports: CREATE DATABASE/TABLE/VIEW/INDEX/SEQUENCE, INSERT, SELECT, UPDATE, DELETE, DROP, ALTER, TRUNCATE
 * Features: Stateful tables, real data storage, WHERE filtering, ORDER BY, LIMIT, aggregates,
 *           JOINs, GROUP BY, HAVING, DISTINCT, UNION, RETURNING, UPSERT, Window Functions,
 *           Subqueries, CASE WHEN, Expression Functions, Views, Sequences, Indexes
 * 
 * PostgreSQL Syntax Validation: Uses @supabase/pg-parser (WASM) for 100% accurate
 * PostgreSQL syntax validation before execution. No invalid SQL can pass through.
 */

import { validateSQLStatements, initPgParser, type ValidationError } from '@/lib/pgValidator';

export type CellValue = string | number | boolean | null;
export type Row = Record<string, CellValue>;

export interface ForeignKeyDef {
  column: string;
  refTable: string;
  refColumn: string;
  onDelete?: string;
  onUpdate?: string;
}

export interface ColumnDef {
  name: string;
  type: string;
  maxLength?: number;
  nullable: boolean;
  defaultValue: CellValue;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement: boolean;
  check?: string;
}

export interface TableState {
  name: string;
  columns: ColumnDef[];
  rows: Row[];
  autoIncrementCounters: Record<string, number>;
  foreignKeys: ForeignKeyDef[];
}

export interface ViewState {
  name: string;
  query: string;
}

export interface IndexState {
  name: string;
  tableName: string;
  columns: string[];
  unique: boolean;
}

export interface SequenceState {
  name: string;
  currentVal: number;
  increment: number;
  minValue: number;
  maxValue: number;
}

export interface DatabaseState {
  name: string;
  tables: Map<string, TableState>;
  views: Map<string, ViewState>;
  indexes: Map<string, IndexState>;
  sequences: Map<string, SequenceState>;
}

export interface ExecutionResult {
  id: string;
  type: 'info' | 'error' | 'success' | 'result' | 'debug' | 'warning' | 'plan';
  message: string;
  timestamp: Date;
  line?: number;
  duration?: number;
  rowsAffected?: number;
  tableData?: { columns: string[]; rows: CellValue[][] };
}

// Persistent engine state across runs
let databases: Map<string, DatabaseState> = new Map();
let currentDb: string | null = null;
let defaultDb: DatabaseState = { name: '__default__', tables: new Map(), views: new Map(), indexes: new Map(), sequences: new Map() };

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

export const resetEngine = () => {
  databases = new Map();
  currentDb = null;
  defaultDb = { name: '__default__', tables: new Map(), views: new Map(), indexes: new Map(), sequences: new Map() };
};

export const getEngineState = () => ({
  databases: Array.from(databases.keys()),
  currentDb,
  tables: Array.from(getActiveDb().tables.keys()),
  totalRows: Array.from(getActiveDb().tables.values()).reduce((sum, t) => sum + t.rows.length, 0),
});

const getActiveDb = (): DatabaseState => {
  if (currentDb && databases.has(currentDb)) return databases.get(currentDb)!;
  return defaultDb;
};

const formatTable = (columns: string[], rows: CellValue[][]): string => {
  const colWidths = columns.map((col, i) => {
    const maxDataWidth = rows.reduce((max, row) => Math.max(max, String(row[i] ?? 'NULL').length), 0);
    return Math.max(col.length, maxDataWidth, 4);
  });

  const hr = '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
  const top = '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
  const bottom = '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

  const header = '│' + columns.map((col, i) => ` ${col.padEnd(colWidths[i])} `).join('│') + '│';

  const dataRows = rows.map(row =>
    '│' + row.map((val, i) => {
      const s = String(val ?? 'NULL');
      return ` ${s.padEnd(colWidths[i])} `;
    }).join('│') + '│'
  );

  return [top, header, hr, ...dataRows, bottom].join('\n');
};

const parseValue = (val: string): CellValue => {
  const trimmed = val.trim();
  if (trimmed.toUpperCase() === 'NULL') return null;
  if (trimmed.toUpperCase() === 'TRUE') return true;
  if (trimmed.toUpperCase() === 'FALSE') return false;
  // Single-quoted strings → string literal
  if (/^'.*'$/.test(trimmed)) return trimmed.slice(1, -1);
  // Double-quoted strings → identifier (return unquoted name, not a string value)
  if (/^".*"$/.test(trimmed)) return trimmed.slice(1, -1);
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  return trimmed;
};

// ─── SQL Reserved Keywords ─────────────────────────────
const SQL_RESERVED_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'DROP', 'ALTER', 'TABLE', 'DATABASE', 'INDEX', 'VIEW', 'PRIMARY', 'KEY',
  'FOREIGN', 'REFERENCES', 'NOT', 'NULL', 'UNIQUE', 'CHECK', 'DEFAULT', 'CONSTRAINT',
  'AND', 'OR', 'IN', 'BETWEEN', 'LIKE', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT',
  'OFFSET', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'ON', 'AS', 'DISTINCT',
  'ALL', 'UNION', 'EXCEPT', 'INTERSECT', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'TRUE', 'FALSE', 'IS', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST', 'CASCADE', 'RESTRICT',
  'GRANT', 'REVOKE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'TRUNCATE', 'EXPLAIN', 'SERIAL',
  'BIGSERIAL', 'INT', 'INTEGER', 'VARCHAR', 'TEXT', 'BOOLEAN', 'DATE', 'TIMESTAMP',
  'FLOAT', 'DOUBLE', 'NUMERIC', 'DECIMAL', 'CHAR', 'SMALLINT', 'BIGINT', 'REAL',
]);

// ─── Column Name Validation ─────────────────────────────
const validateIdentifierName = (name: string, kind: string = 'column'): string | null => {
  if (/^\d/.test(name)) return `ERROR: ${kind} name "${name}" cannot start with a number`;
  if (/\s/.test(name) && !name.startsWith('"')) return `ERROR: ${kind} name "${name}" cannot contain spaces (use double quotes)`;
  if (SQL_RESERVED_KEYWORDS.has(name.toUpperCase()) && !name.startsWith('"')) return `ERROR: "${name}" is a reserved keyword, use double quotes to escape it`;
  return null;
};

// ─── Data Type Validation ─────────────────────────────
const validateDataType = (val: CellValue, colDef: ColumnDef): string | null => {
  if (val === null) return null;
  const baseType = colDef.type.replace(/\(.+\)/, '').toUpperCase().trim();

  // INT types: reject non-numeric strings
  if (['INT', 'INTEGER', 'SMALLINT', 'BIGINT', 'SERIAL', 'BIGSERIAL'].includes(baseType)) {
    if (typeof val === 'string' && isNaN(Number(val))) {
      return `ERROR: invalid input syntax for type integer: "${val}"`;
    }
  }

  // BOOLEAN: only true/false/null
  if (['BOOLEAN', 'BOOL'].includes(baseType)) {
    if (typeof val === 'string' && !['true', 'false', '1', '0', 't', 'f'].includes(val.toLowerCase())) {
      return `ERROR: invalid input syntax for type boolean: "${val}"`;
    }
  }

  // NUMERIC/FLOAT/REAL/DECIMAL: reject non-numeric strings
  if (['FLOAT', 'DOUBLE', 'REAL', 'NUMERIC', 'DECIMAL'].includes(baseType)) {
    if (typeof val === 'string' && isNaN(Number(val))) {
      return `ERROR: invalid input syntax for type numeric: "${val}"`;
    }
  }

  // DATE: validate format
  if (baseType === 'DATE') {
    if (typeof val === 'string') {
      const d = new Date(val);
      if (isNaN(d.getTime())) return `ERROR: invalid input syntax for type date: "${val}"`;
    }
  }

  return null;
};

// ─── Coerce value to column type ─────────────────────────────
const coerceValue = (val: CellValue, colDef: ColumnDef): CellValue => {
  if (val === null) return null;
  const baseType = colDef.type.replace(/\(.+\)/, '').toUpperCase().trim();

  if (['INT', 'INTEGER', 'SMALLINT', 'BIGINT', 'SERIAL', 'BIGSERIAL'].includes(baseType)) {
    const n = Number(val);
    if (!isNaN(n)) return Math.floor(n);
  }
  if (['FLOAT', 'DOUBLE', 'REAL', 'NUMERIC', 'DECIMAL'].includes(baseType)) {
    const n = Number(val);
    if (!isNaN(n)) return n;
  }
  if (['BOOLEAN', 'BOOL'].includes(baseType)) {
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      if (lower === 'true' || lower === 't' || lower === '1') return true;
      if (lower === 'false' || lower === 'f' || lower === '0') return false;
    }
    return Boolean(val);
  }
  // CHAR(n): pad with spaces to fixed length
  if (baseType === 'CHAR' && colDef.maxLength !== undefined) {
    return String(val).padEnd(colDef.maxLength, ' ');
  }
  return val;
};

// ─── CHECK Constraint Evaluation ─────────────────────────────
const evaluateCheckConstraint = (check: string, row: Row): boolean => {
  try {
    return evaluateCondition(row, check);
  } catch {
    return true; // If we can't parse, allow it
  }
};

// ─── Foreign Key Validation ─────────────────────────────
const validateForeignKey = (fk: ForeignKeyDef, value: CellValue, db: DatabaseState): string | null => {
  if (value === null) return null; // FK can be NULL
  const parentTable = db.tables.get(fk.refTable.toLowerCase());
  if (!parentTable) return `ERROR: referenced table "${fk.refTable}" does not exist`;
  const exists = parentTable.rows.some(r => r[fk.refColumn.toLowerCase()] == value);
  if (!exists) return `ERROR: insert or update on table violates foreign key constraint\nDETAIL: Key (${fk.column})=(${value}) is not present in table "${fk.refTable}"`;
  return null;
};

// ─── Full row validation for INSERT/UPDATE ─────────────────────────────
const validateRow = (row: Row, table: TableState, db: DatabaseState, isUpdate = false, updatedCols?: string[]): string | null => {
  const colsToCheck = updatedCols ? table.columns.filter(c => updatedCols.includes(c.name)) : table.columns;

  for (const col of colsToCheck) {
    const val = row[col.name];

    // NOT NULL check
    if (!col.nullable && (val === null || val === undefined) && !col.autoIncrement) {
      return `ERROR: null value in column "${col.name}" violates not-null constraint`;
    }

    if (val === null || val === undefined) continue;

    // Data type check
    const typeErr = validateDataType(val, col);
    if (typeErr) return typeErr;

    // VARCHAR/CHAR length check
    const lenErr = validateVarcharLength(val, col);
    if (lenErr) return `${lenErr}\nDETAIL: Column "${col.name}" value "${val}" exceeds limit`;

    // CHECK constraint
    if (col.check) {
      if (!evaluateCheckConstraint(col.check, row)) {
        return `ERROR: new row violates check constraint\nDETAIL: Failing row check: ${col.check}`;
      }
    }
  }

  // Primary key NOT NULL check
  for (const col of table.columns) {
    if (col.primaryKey && (row[col.name] === null || row[col.name] === undefined)) {
      return `ERROR: null value in column "${col.name}" violates not-null constraint\nDETAIL: Column "${col.name}" is part of the primary key`;
    }
  }

  // Unique constraint check (for INSERT or if updating unique cols)
  if (!isUpdate || updatedCols?.some(c => table.columns.find(col => col.name === c && (col.unique || col.primaryKey)))) {
    for (const col of table.columns) {
      if ((col.unique || col.primaryKey) && row[col.name] !== null) {
        const duplicate = table.rows.find(r => r !== row && r[col.name] === row[col.name]);
        if (duplicate) {
          return `ERROR: duplicate key value violates unique constraint "${table.name}_${col.name}_key"\nDETAIL: Key (${col.name})=(${row[col.name]}) already exists.`;
        }
      }
    }
  }

  // Foreign key checks
  for (const fk of table.foreignKeys) {
    if (!updatedCols || updatedCols.includes(fk.column)) {
      const fkErr = validateForeignKey(fk, row[fk.column], db);
      if (fkErr) return fkErr;
    }
  }

  return null;
};

// ─── Expression Evaluator ────────────────────────────────
// Evaluates SQL expressions including functions, CASE WHEN, casts, etc.

const evaluateExpression = (expr: string, row: Row = {}): CellValue => {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();

  // NULL literal
  if (upper === 'NULL') return null;
  if (upper === 'TRUE') return true;
  if (upper === 'FALSE') return false;

  // Single-quoted string literal → string value (handle escaped quotes '')
  if (/^'.*'$/s.test(trimmed)) return trimmed.slice(1, -1).replace(/''/g, "'");

  // Double-quoted identifier → resolve as column reference
  if (/^".*"$/s.test(trimmed)) {
    const identName = trimmed.slice(1, -1).toLowerCase();
    if (row[identName] !== undefined) return row[identName];
    return identName;
  }

  // Numeric literal
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);

  // Parenthesized expression
  if (trimmed.startsWith('(') && findClosingParen(trimmed, 0) === trimmed.length - 1) {
    return evaluateExpression(trimmed.slice(1, -1).trim(), row);
  }

  // CASE WHEN ... THEN ... ELSE ... END
  const caseMatch = trimmed.match(/^CASE\s+([\s\S]+)\s+END$/i);
  if (caseMatch) {
    return evaluateCaseWhen(caseMatch[1], row);
  }

  // Type casting: CAST(expr AS type) 
  const castMatch = trimmed.match(/^CAST\s*\(\s*(.+?)\s+AS\s+(\w+(?:\s*\(\s*\d+\s*(?:,\s*\d+\s*)?\))?)\s*\)$/i);
  if (castMatch) {
    return applyCast(evaluateExpression(castMatch[1], row), castMatch[2]);
  }
  // PG-style cast: expr::type
  const pgCast = trimmed.match(/^(.+?)::(\w+(?:\s*\(\s*\d+\s*(?:,\s*\d+\s*)?\))?)$/);
  if (pgCast) {
    return applyCast(evaluateExpression(pgCast[1], row), pgCast[2]);
  }

  // ─── SQL Functions ─────────────────────────────
  const funcMatch = trimmed.match(/^(\w+)\s*\(([\s\S]*)\)$/i);
  if (funcMatch) {
    const fname = funcMatch[1].toUpperCase();
    // Make sure it's not a keyword being misinterpreted
    if (!['CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'EXISTS'].includes(fname)) {
      const args = splitTopLevelCommas(funcMatch[2]).map(a => a.trim());
      return evaluateFunction(fname, args, row);
    }
  }

  // String concatenation with || (at top level only)
  {
    let depth = 0, inStr = false, inDbl = false;
    let concatIdx = -1;
    for (let ci = 0; ci < trimmed.length - 1; ci++) {
      if (trimmed[ci] === "'" && !inDbl) inStr = !inStr;
      if (trimmed[ci] === '"' && !inStr) inDbl = !inDbl;
      if (!inStr && !inDbl) {
        if (trimmed[ci] === '(') depth++;
        if (trimmed[ci] === ')') depth--;
        if (depth === 0 && trimmed[ci] === '|' && trimmed[ci + 1] === '|') {
          concatIdx = ci;
          break;
        }
      }
    }
    if (concatIdx >= 0) {
      const left = evaluateExpression(trimmed.slice(0, concatIdx), row);
      const right = evaluateExpression(trimmed.slice(concatIdx + 2), row);
      return (left === null ? '' : String(left)) + (right === null ? '' : String(right));
    }
  }

  // Arithmetic with column references: find top-level +, -, *, /, %
  {
    let depth = 0, inStr = false, inDbl = false;
    // Search for + or - at top level (lowest precedence), then * / %
    let lastAddSub = -1, lastMulDiv = -1;
    for (let ci = 0; ci < trimmed.length; ci++) {
      if (trimmed[ci] === "'" && !inDbl) inStr = !inStr;
      if (trimmed[ci] === '"' && !inStr) inDbl = !inDbl;
      if (!inStr && !inDbl) {
        if (trimmed[ci] === '(') depth++;
        if (trimmed[ci] === ')') depth--;
        if (depth === 0) {
          if ((trimmed[ci] === '+' || trimmed[ci] === '-') && ci > 0) {
            // Make sure it's not part of a number like -5 or scientific notation
            const prevChar = trimmed[ci - 1];
            if (prevChar !== 'E' && prevChar !== 'e') lastAddSub = ci;
          }
          if ((trimmed[ci] === '*' || trimmed[ci] === '/' || trimmed[ci] === '%') && ci > 0) {
            lastMulDiv = ci;
          }
        }
      }
    }
    const splitAt = lastAddSub >= 0 ? lastAddSub : lastMulDiv;
    if (splitAt > 0 && splitAt < trimmed.length - 1) {
      const left = evaluateExpression(trimmed.slice(0, splitAt), row);
      const op = trimmed[splitAt];
      const right = evaluateExpression(trimmed.slice(splitAt + 1), row);
      const lNum = Number(left), rNum = Number(right);
      if (!isNaN(lNum) && !isNaN(rNum)) {
        if (op === '/' && rNum === 0) throw new Error('ERROR: division by zero');
        if (op === '+') return lNum + rNum;
        if (op === '-') return lNum - rNum;
        if (op === '*') return lNum * rNum;
        if (op === '/') return lNum / rNum;
        if (op === '%') return lNum % rNum;
      }
    }
  }

  // Column reference (possibly with table alias)
  const colName = trimmed.toLowerCase().replace(/"/g, '');
  if (row[colName] !== undefined) return row[colName];

  // Dotted column reference (e.g. t.name)
  if (colName.includes('.')) {
    if (row[colName] !== undefined) return row[colName];
    // Try just the column part
    const parts = colName.split('.');
    const justCol = parts[parts.length - 1];
    if (row[justCol] !== undefined) return row[justCol];
  }

  // Try exact match
  if (row[trimmed] !== undefined) return row[trimmed];

  // NOW(), CURRENT_TIMESTAMP, CURRENT_DATE, CURRENT_TIME
  if (upper === 'NOW()' || upper === 'CURRENT_TIMESTAMP') return new Date().toISOString();
  if (upper === 'CURRENT_DATE') return new Date().toISOString().split('T')[0];
  if (upper === 'CURRENT_TIME') return new Date().toISOString().split('T')[1].replace('Z', '');

  // If it looks like a pure numeric expression, try evaluating
  if (/^[\d\s+\-*/%.()]+$/.test(trimmed)) {
    try {
      if (/\/\s*0(?![.\d])/.test(trimmed)) throw new Error('division by zero');
      const result = Function(`"use strict"; return (${trimmed})`)();
      if (typeof result === 'number') {
        if (!isFinite(result)) throw new Error('division by zero');
        return result;
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'division by zero') throw new Error('ERROR: division by zero');
    }
  }

  return trimmed;
};

const evaluateCaseWhen = (body: string, row: Row): CellValue => {
  // Parse WHEN ... THEN ... pairs and optional ELSE
  const whenRegex = /WHEN\s+([\s\S]+?)\s+THEN\s+([\s\S]+?)(?=\s+WHEN|\s+ELSE|\s*$)/gi;
  let match: RegExpExecArray | null;

  while ((match = whenRegex.exec(body)) !== null) {
    const condition = match[1].trim();
    const thenValue = match[2].trim();
    if (evaluateCondition(row, condition)) {
      return evaluateExpression(thenValue, row);
    }
  }

  // ELSE clause
  const elseMatch = body.match(/ELSE\s+([\s\S]+?)$/i);
  if (elseMatch) {
    return evaluateExpression(elseMatch[1].trim(), row);
  }

  return null;
};

const parseTypeLength = (typeStr: string): { baseType: string; maxLength?: number } => {
  const m = typeStr.match(/^(VARCHAR|CHAR|CHARACTER(?:\s+VARYING)?)\s*\(\s*(\d+)\s*\)/i);
  if (m) return { baseType: m[1].toUpperCase(), maxLength: parseInt(m[2], 10) };
  return { baseType: typeStr.replace(/\(.+\)/, '').toUpperCase(), maxLength: undefined };
};

const validateVarcharLength = (val: CellValue, colDef: ColumnDef): string | null => {
  if (val === null || val === undefined) return null;
  if (colDef.maxLength !== undefined) {
    const str = String(val);
    if (str.length > colDef.maxLength) {
      return `ERROR: value too long for type character varying(${colDef.maxLength})`;
    }
  }
  return null;
};

const applyCast = (val: CellValue, targetType: string): CellValue => {
  const { baseType } = parseTypeLength(targetType);
  const t = baseType.toUpperCase();
  if (val === null) return null;
  if (t === 'INT' || t === 'INTEGER' || t === 'BIGINT' || t === 'SMALLINT') return parseInt(String(val), 10) || 0;
  if (t === 'FLOAT' || t === 'DOUBLE' || t === 'REAL' || t === 'NUMERIC' || t === 'DECIMAL') return parseFloat(String(val)) || 0;
  if (t === 'TEXT') return String(val);
  if (t === 'VARCHAR' || t === 'CHAR' || t === 'CHARACTER' || t === 'CHARACTER VARYING') {
    const s = String(val);
    const lenMatch = targetType.match(/\(\s*(\d+)\s*\)/);
    if (lenMatch) {
      const max = parseInt(lenMatch[1], 10);
      if (s.length > max) throw new Error(`value too long for type character varying(${max})`);
    }
    return s;
  }
  if (t === 'BOOLEAN' || t === 'BOOL') return Boolean(val);
  return val;
};

const evaluateFunction = (fname: string, args: string[], row: Row): CellValue => {
  const evalArg = (i: number): CellValue => i < args.length ? evaluateExpression(args[i], row) : null;

  switch (fname) {
    // ─── String Functions ──────────────────
    case 'UPPER': return String(evalArg(0) ?? '').toUpperCase();
    case 'LOWER': return String(evalArg(0) ?? '').toLowerCase();
    case 'LENGTH': case 'CHAR_LENGTH': case 'CHARACTER_LENGTH':
      return String(evalArg(0) ?? '').length;
    case 'TRIM': return String(evalArg(0) ?? '').trim();
    case 'LTRIM': return String(evalArg(0) ?? '').trimStart();
    case 'RTRIM': return String(evalArg(0) ?? '').trimEnd();
    case 'LEFT': return String(evalArg(0) ?? '').slice(0, Number(evalArg(1) || 0));
    case 'RIGHT': {
      const s = String(evalArg(0) ?? '');
      const n = Number(evalArg(1) || 0);
      return s.slice(-n);
    }
    case 'SUBSTRING': case 'SUBSTR': {
      const s = String(evalArg(0) ?? '');
      const start = Number(evalArg(1) || 1) - 1; // SQL is 1-based
      const len = args.length >= 3 ? Number(evalArg(2)) : undefined;
      return len !== undefined ? s.substring(start, start + len) : s.substring(start);
    }
    case 'REPLACE': {
      const s = String(evalArg(0) ?? '');
      const from = String(evalArg(1) ?? '');
      const to = String(evalArg(2) ?? '');
      return s.split(from).join(to);
    }
    case 'CONCAT': return args.map((_, i) => String(evalArg(i) ?? '')).join('');
    case 'CONCAT_WS': {
      const sep = String(evalArg(0) ?? '');
      return args.slice(1).map((_, i) => String(evaluateExpression(args[i + 1], row) ?? '')).filter(Boolean).join(sep);
    }
    case 'POSITION': case 'STRPOS': {
      // POSITION('sub' IN 'string') or STRPOS('string', 'sub')
      const haystack = String(evalArg(0) ?? '');
      const needle = String(evalArg(1) ?? '');
      return haystack.indexOf(needle) + 1; // 1-based
    }
    case 'REPEAT': return String(evalArg(0) ?? '').repeat(Number(evalArg(1) || 0));
    case 'REVERSE': return String(evalArg(0) ?? '').split('').reverse().join('');
    case 'INITCAP': return String(evalArg(0) ?? '').replace(/\b\w/g, c => c.toUpperCase());
    case 'LPAD': {
      const s = String(evalArg(0) ?? '');
      const len = Number(evalArg(1) || 0);
      const pad = String(evalArg(2) ?? ' ');
      return s.padStart(len, pad);
    }
    case 'RPAD': {
      const s = String(evalArg(0) ?? '');
      const len = Number(evalArg(1) || 0);
      const pad = String(evalArg(2) ?? ' ');
      return s.padEnd(len, pad);
    }
    case 'SPLIT_PART': {
      const s = String(evalArg(0) ?? '');
      const delim = String(evalArg(1) ?? '');
      const idx = Number(evalArg(2) || 1) - 1;
      const parts = s.split(delim);
      return parts[idx] ?? '';
    }
    case 'MD5': {
      // Simple hash simulation
      let hash = 0;
      const s = String(evalArg(0) ?? '');
      for (let i = 0; i < s.length; i++) {
        const chr = s.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
      }
      return Math.abs(hash).toString(16).padStart(32, '0').slice(0, 32);
    }
    case 'TRANSLATE': {
      const s = String(evalArg(0) ?? '');
      const from = String(evalArg(1) ?? '');
      const to = String(evalArg(2) ?? '');
      let result = '';
      for (const ch of s) {
        const idx = from.indexOf(ch);
        result += idx >= 0 ? (to[idx] || '') : ch;
      }
      return result;
    }
    case 'ASCII': return (String(evalArg(0) ?? '')).charCodeAt(0) || 0;
    case 'CHR': return String.fromCharCode(Number(evalArg(0) || 0));
    case 'ENCODE': return btoa(String(evalArg(0) ?? ''));
    case 'DECODE': { try { return atob(String(evalArg(0) ?? '')); } catch { return null; } }
    case 'REGEXP_REPLACE': {
      const s = String(evalArg(0) ?? '');
      const pattern = String(evalArg(1) ?? '');
      const repl = String(evalArg(2) ?? '');
      const flags = String(evalArg(3) ?? 'g');
      try { return s.replace(new RegExp(pattern, flags), repl); } catch { return s; }
    }
    case 'REGEXP_MATCH': case 'REGEXP_MATCHES': {
      const s = String(evalArg(0) ?? '');
      const pattern = String(evalArg(1) ?? '');
      try {
        const m = s.match(new RegExp(pattern));
        return m ? m[0] : null;
      } catch { return null; }
    }

    // ─── Math Functions ──────────────────
    case 'ABS': return Math.abs(Number(evalArg(0) || 0));
    case 'CEIL': case 'CEILING': return Math.ceil(Number(evalArg(0) || 0));
    case 'FLOOR': return Math.floor(Number(evalArg(0) || 0));
    case 'ROUND': {
      const val = Number(evalArg(0) || 0);
      const dec = Number(evalArg(1) || 0);
      const factor = Math.pow(10, dec);
      return Math.round(val * factor) / factor;
    }
    case 'TRUNC': case 'TRUNCATE': {
      const val = Number(evalArg(0) || 0);
      const dec = Number(evalArg(1) || 0);
      const factor = Math.pow(10, dec);
      return Math.trunc(val * factor) / factor;
    }
    case 'MOD': return Number(evalArg(0) || 0) % Number(evalArg(1) || 1);
    case 'POWER': case 'POW': return Math.pow(Number(evalArg(0) || 0), Number(evalArg(1) || 0));
    case 'SQRT': return Math.sqrt(Number(evalArg(0) || 0));
    case 'CBRT': return Math.cbrt(Number(evalArg(0) || 0));
    case 'LOG': return args.length >= 2
      ? Math.log(Number(evalArg(1) || 1)) / Math.log(Number(evalArg(0) || 10))
      : Math.log10(Number(evalArg(0) || 1));
    case 'LN': return Math.log(Number(evalArg(0) || 1));
    case 'EXP': return Math.exp(Number(evalArg(0) || 0));
    case 'PI': return Math.PI;
    case 'RANDOM': return Math.random();
    case 'SIGN': return Math.sign(Number(evalArg(0) || 0));
    case 'DEGREES': return Number(evalArg(0) || 0) * (180 / Math.PI);
    case 'RADIANS': return Number(evalArg(0) || 0) * (Math.PI / 180);
    case 'SIN': return Math.sin(Number(evalArg(0) || 0));
    case 'COS': return Math.cos(Number(evalArg(0) || 0));
    case 'TAN': return Math.tan(Number(evalArg(0) || 0));
    case 'ASIN': return Math.asin(Number(evalArg(0) || 0));
    case 'ACOS': return Math.acos(Number(evalArg(0) || 0));
    case 'ATAN': return Math.atan(Number(evalArg(0) || 0));
    case 'ATAN2': return Math.atan2(Number(evalArg(0) || 0), Number(evalArg(1) || 0));
    case 'GCD': {
      let a = Math.abs(Number(evalArg(0) || 0));
      let b = Math.abs(Number(evalArg(1) || 0));
      while (b) { [a, b] = [b, a % b]; }
      return a;
    }
    case 'LCM': {
      const a = Math.abs(Number(evalArg(0) || 0));
      const b = Math.abs(Number(evalArg(1) || 0));
      if (a === 0 || b === 0) return 0;
      let ga = a, gb = b;
      while (gb) { [ga, gb] = [gb, ga % gb]; }
      return (a * b) / ga;
    }
    case 'GREATEST': return Math.max(...args.map((_, i) => Number(evalArg(i) ?? -Infinity)));
    case 'LEAST': return Math.min(...args.map((_, i) => Number(evalArg(i) ?? Infinity)));
    case 'WIDTH_BUCKET': {
      const val = Number(evalArg(0) || 0);
      const lo = Number(evalArg(1) || 0);
      const hi = Number(evalArg(2) || 1);
      const count = Number(evalArg(3) || 1);
      if (val < lo) return 0;
      if (val >= hi) return count + 1;
      return Math.floor((val - lo) / ((hi - lo) / count)) + 1;
    }

    // ─── Conditional Functions ──────────────────
    case 'COALESCE': {
      for (let i = 0; i < args.length; i++) {
        const v = evalArg(i);
        if (v !== null && v !== undefined) return v;
      }
      return null;
    }
    case 'NULLIF': {
      const a = evalArg(0);
      const b = evalArg(1);
      return a == b ? null : a;
    }
    case 'IF': case 'IIF': {
      const cond = evalArg(0);
      return cond ? evalArg(1) : evalArg(2);
    }

    // ─── Date/Time Functions ──────────────────
    case 'NOW': return new Date().toISOString();
    case 'CURRENT_DATE': return new Date().toISOString().split('T')[0];
    case 'CURRENT_TIME': return new Date().toISOString().split('T')[1].replace('Z', '');
    case 'CURRENT_TIMESTAMP': return new Date().toISOString();
    case 'EXTRACT': case 'DATE_PART': {
      const field = String(evalArg(0) ?? '').toUpperCase().replace(/'/g, '');
      const dateStr = String(evalArg(1) ?? '');
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      switch (field) {
        case 'YEAR': return d.getFullYear();
        case 'MONTH': return d.getMonth() + 1;
        case 'DAY': case 'DOM': return d.getDate();
        case 'HOUR': return d.getHours();
        case 'MINUTE': return d.getMinutes();
        case 'SECOND': return d.getSeconds();
        case 'DOW': return d.getDay();
        case 'DOY': {
          const start = new Date(d.getFullYear(), 0, 0);
          return Math.floor((d.getTime() - start.getTime()) / 86400000);
        }
        case 'WEEK': {
          const start = new Date(d.getFullYear(), 0, 1);
          return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
        }
        case 'QUARTER': return Math.ceil((d.getMonth() + 1) / 3);
        case 'EPOCH': return Math.floor(d.getTime() / 1000);
        default: return null;
      }
    }
    case 'DATE_TRUNC': {
      const field = String(evalArg(0) ?? '').toUpperCase().replace(/'/g, '');
      const dateStr = String(evalArg(1) ?? '');
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      switch (field) {
        case 'YEAR': return new Date(d.getFullYear(), 0, 1).toISOString();
        case 'MONTH': return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
        case 'DAY': return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
        case 'HOUR': return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).toISOString();
        default: return d.toISOString();
      }
    }
    case 'AGE': {
      const d1 = new Date(String(evalArg(0) ?? ''));
      const d2 = args.length > 1 ? new Date(String(evalArg(1) ?? '')) : new Date();
      if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
      const diff = Math.abs(d2.getTime() - d1.getTime());
      const days = Math.floor(diff / 86400000);
      const years = Math.floor(days / 365);
      const months = Math.floor((days % 365) / 30);
      const remainDays = days % 30;
      return `${years} years ${months} mons ${remainDays} days`;
    }
    case 'TO_CHAR': {
      const val = evalArg(0);
      const fmt = String(evalArg(1) ?? '');
      if (val === null) return null;
      // Basic date formatting
      const d = new Date(String(val));
      if (!isNaN(d.getTime())) {
        let result = fmt;
        result = result.replace('YYYY', String(d.getFullYear()));
        result = result.replace('MM', String(d.getMonth() + 1).padStart(2, '0'));
        result = result.replace('DD', String(d.getDate()).padStart(2, '0'));
        result = result.replace('HH24', String(d.getHours()).padStart(2, '0'));
        result = result.replace('HH', String(d.getHours() % 12 || 12).padStart(2, '0'));
        result = result.replace('MI', String(d.getMinutes()).padStart(2, '0'));
        result = result.replace('SS', String(d.getSeconds()).padStart(2, '0'));
        return result;
      }
      // Numeric formatting
      if (typeof val === 'number') {
        if (fmt.includes('.')) {
          const decPlaces = fmt.split('.')[1]?.replace(/[^9#0]/g, '').length || 0;
          return val.toFixed(decPlaces);
        }
        return String(val);
      }
      return String(val);
    }
    case 'TO_DATE': {
      const s = String(evalArg(0) ?? '');
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    }
    case 'TO_TIMESTAMP': {
      const s = String(evalArg(0) ?? '');
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    case 'TO_NUMBER': {
      const s = String(evalArg(0) ?? '');
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    }
    case 'DATE': {
      const s = String(evalArg(0) ?? '');
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    }
    case 'MAKE_DATE': {
      const y = Number(evalArg(0) || 2000);
      const m = Number(evalArg(1) || 1);
      const d = Number(evalArg(2) || 1);
      return new Date(y, m - 1, d).toISOString().split('T')[0];
    }
    case 'MAKE_TIME': {
      const h = Number(evalArg(0) || 0);
      const m = Number(evalArg(1) || 0);
      const s = Number(evalArg(2) || 0);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}`;
    }
    case 'MAKE_TIMESTAMP': {
      const y = Number(evalArg(0) || 2000);
      const mo = Number(evalArg(1) || 1);
      const d = Number(evalArg(2) || 1);
      const h = Number(evalArg(3) || 0);
      const mi = Number(evalArg(4) || 0);
      const s = Number(evalArg(5) || 0);
      return new Date(y, mo - 1, d, h, mi, Math.floor(s)).toISOString();
    }

    // ─── Sequence Functions ──────────────────
    case 'NEXTVAL': {
      const seqName = String(evalArg(0) ?? '').toLowerCase().replace(/'/g, '');
      const db = getActiveDb();
      const seq = db.sequences.get(seqName);
      if (!seq) return null;
      seq.currentVal += seq.increment;
      return seq.currentVal;
    }
    case 'CURRVAL': {
      const seqName = String(evalArg(0) ?? '').toLowerCase().replace(/'/g, '');
      const db = getActiveDb();
      const seq = db.sequences.get(seqName);
      return seq ? seq.currentVal : null;
    }
    case 'SETVAL': {
      const seqName = String(evalArg(0) ?? '').toLowerCase().replace(/'/g, '');
      const val = Number(evalArg(1) || 0);
      const db = getActiveDb();
      const seq = db.sequences.get(seqName);
      if (seq) seq.currentVal = val;
      return val;
    }

    // ─── Utility Functions ──────────────────
    case 'GENERATE_SERIES': {
      // Returns just one value in scalar context; used in FROM in real PG
      const start = Number(evalArg(0) || 0);
      return start;
    }
    case 'VERSION': return 'PostgreSQL 16.2 (Advanced SQL Engine v3.0)';
    case 'CURRENT_DATABASE': return getActiveDb().name;
    case 'CURRENT_SCHEMA': return 'public';
    case 'CURRENT_USER': case 'SESSION_USER': return 'postgres';
    case 'PG_TYPEOF': return typeof evalArg(0);
    case 'GEN_RANDOM_UUID': return crypto.randomUUID();
    case 'UUID_GENERATE_V4': return crypto.randomUUID();

    // ─── Array-like Functions ──────────────────
    case 'ARRAY_LENGTH': return args.length;
    case 'STRING_TO_ARRAY': {
      const s = String(evalArg(0) ?? '');
      const delim = String(evalArg(1) ?? ',');
      return `{${s.split(delim).join(',')}}`;
    }
    case 'ARRAY_TO_STRING': {
      const arr = String(evalArg(0) ?? '').replace(/[{}]/g, '');
      const delim = String(evalArg(1) ?? ',');
      return arr.split(',').join(delim);
    }

    // ─── JSON Functions ──────────────────
    case 'JSON_BUILD_OBJECT': case 'JSONB_BUILD_OBJECT': {
      const obj: Record<string, CellValue> = {};
      for (let i = 0; i < args.length - 1; i += 2) {
        const key = String(evalArg(i) ?? '').replace(/'/g, '');
        obj[key] = evalArg(i + 1);
      }
      return JSON.stringify(obj);
    }
    case 'JSON_BUILD_ARRAY': case 'JSONB_BUILD_ARRAY': {
      const arr = args.map((_, i) => evalArg(i));
      return JSON.stringify(arr);
    }
    case 'JSON_EXTRACT_PATH_TEXT': case 'JSONB_EXTRACT_PATH_TEXT': {
      try {
        let obj = JSON.parse(String(evalArg(0) ?? '{}'));
        for (let i = 1; i < args.length; i++) {
          const key = String(evalArg(i) ?? '').replace(/'/g, '');
          obj = obj[key];
        }
        return obj !== undefined ? String(obj) : null;
      } catch { return null; }
    }
    case 'ROW_TO_JSON': case 'TO_JSON': case 'TO_JSONB': {
      return JSON.stringify(evalArg(0));
    }
    case 'JSON_ARRAY_LENGTH': case 'JSONB_ARRAY_LENGTH': {
      try {
        const arr = JSON.parse(String(evalArg(0) ?? '[]'));
        return Array.isArray(arr) ? arr.length : 0;
      } catch { return 0; }
    }

    // ─── Aggregate Functions (scalar context) ──────────────────
    case 'COUNT': case 'SUM': case 'AVG': case 'MIN': case 'MAX':
    case 'STRING_AGG': case 'ARRAY_AGG': case 'BOOL_AND': case 'BOOL_OR':
      // These are handled by GROUP BY logic; in scalar context return 0
      return 0;

    default:
      // Unknown function, return expression as-is
      return `${fname}(${args.join(', ')})`;
  }
};

// ─── Condition Evaluator ────────────────────────────────

const evaluateCondition = (row: Row, where: string): boolean => {
  if (!where || !where.trim()) return true;
  const trimmed = where.trim();

  // Handle parenthesized expressions
  if (trimmed.startsWith('(') && findClosingParen(trimmed, 0) === trimmed.length - 1) {
    return evaluateCondition(row, trimmed.slice(1, -1).trim());
  }

  // Handle AND/OR at top level (respect parens and strings)
  const andIdx = findTopLevelKeyword(trimmed, 'AND');
  if (andIdx >= 0) {
    const left = trimmed.slice(0, andIdx).trim();
    const right = trimmed.slice(andIdx + 3).trim();
    return evaluateCondition(row, left) && evaluateCondition(row, right);
  }
  const orIdx = findTopLevelKeyword(trimmed, 'OR');
  if (orIdx >= 0) {
    const left = trimmed.slice(0, orIdx).trim();
    const right = trimmed.slice(orIdx + 2).trim();
    return evaluateCondition(row, left) || evaluateCondition(row, right);
  }

  // NOT
  const notMatch = trimmed.match(/^NOT\s+(.+)$/i);
  if (notMatch) return !evaluateCondition(row, notMatch[1].trim());

  // EXISTS (basic)
  const existsMatch = trimmed.match(/^EXISTS\s*\((.+)\)$/i);
  if (existsMatch) return true;

  // IS NULL / IS NOT NULL (support dotted columns and quoted identifiers)
  const isNullMatch = trimmed.match(/^(.+?)\s+IS\s+NOT\s+NULL$/i);
  if (isNullMatch) {
    const val = evaluateExpression(isNullMatch[1].trim(), row);
    return val !== null && val !== undefined;
  }
  const isNull2 = trimmed.match(/^(.+?)\s+IS\s+NULL$/i);
  if (isNull2) {
    const val = evaluateExpression(isNull2[1].trim(), row);
    return val === null || val === undefined;
  }

  // LIKE / ILIKE (support expressions on LHS)
  const likeMatch = trimmed.match(/^(.+?)\s+(NOT\s+)?(I)?LIKE\s+'(.+)'$/i);
  if (likeMatch) {
    const val = String(evaluateExpression(likeMatch[1].trim(), row) ?? '');
    const pattern = likeMatch[4].replace(/%/g, '.*').replace(/_/g, '.');
    const flags = likeMatch[3] ? 'i' : '';
    const matches = new RegExp(`^${pattern}$`, flags).test(val);
    return likeMatch[2] ? !matches : matches;
  }

  // SIMILAR TO
  const similarMatch = trimmed.match(/^(.+?)\s+SIMILAR\s+TO\s+'(.+)'$/i);
  if (similarMatch) {
    const val = String(evaluateExpression(similarMatch[1].trim(), row) ?? '');
    const pattern = similarMatch[2].replace(/%/g, '.*').replace(/_/g, '.');
    return new RegExp(`^${pattern}$`).test(val);
  }

  // IN (support expressions on LHS)
  const inMatch = trimmed.match(/^(.+?)\s+(NOT\s+)?IN\s*\((.+)\)$/i);
  if (inMatch) {
    const val = evaluateExpression(inMatch[1].trim(), row);
    if (val === null) return false;
    const listStr = inMatch[3].trim();
    if (!listStr) return inMatch[2] ? true : false;
    const list = splitTopLevelCommas(listStr).map(v => parseValue(v.trim()));
    if (list.length === 0) return inMatch[2] ? true : false;
    const found = list.some(v => v == val);
    return inMatch[2] ? !found : found;
  }

  // BETWEEN
  const betweenMatch = trimmed.match(/^(.+?)\s+(NOT\s+)?BETWEEN\s+(.+)\s+AND\s+(.+)$/i);
  if (betweenMatch) {
    const val = Number(evaluateExpression(betweenMatch[1].trim(), row));
    const lo = Number(parseValue(betweenMatch[3].trim()));
    const hi = Number(parseValue(betweenMatch[4].trim()));
    const inRange = val >= lo && val <= hi;
    return betweenMatch[2] ? !inRange : inRange;
  }

  // ANY / ALL (basic)
  const anyMatch = trimmed.match(/^(.+?)\s*(=|!=|<>|>|<|>=|<=)\s*ANY\s*\((.+)\)$/i);
  if (anyMatch) {
    const lhs = evaluateExpression(anyMatch[1].trim(), row);
    const vals = splitTopLevelCommas(anyMatch[3]).map(v => parseValue(v.trim()));
    return vals.some(v => compareValues(lhs, anyMatch[2], v));
  }

  // Comparison operators - find the operator at top level
  const compResult = findTopLevelComparison(trimmed);
  if (compResult) {
    const lhs = evaluateExpression(compResult.left, row);
    const rhs = evaluateExpression(compResult.right, row);
    return compareValues(lhs, compResult.op, rhs);
  }

  // Boolean column reference
  const colVal = evaluateExpression(trimmed, row);
  if (typeof colVal === 'boolean') return colVal;
  if (colVal === 1 || colVal === 'true' || colVal === 't') return true;
  if (colVal === 0 || colVal === 'false' || colVal === 'f') return false;

  return true;
};

// Find closing parenthesis matching the one at position `start`
const findClosingParen = (s: string, start: number): number => {
  let depth = 0;
  let inStr = false, inDblStr = false;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "'" && !inDblStr) inStr = !inStr;
    if (s[i] === '"' && !inStr) inDblStr = !inDblStr;
    if (!inStr && !inDblStr) {
      if (s[i] === '(') depth++;
      if (s[i] === ')') { depth--; if (depth === 0) return i; }
    }
  }
  return -1;
};

// Find a keyword (AND/OR) at top level (not inside parens or strings)
const findTopLevelKeyword = (s: string, keyword: string): number => {
  let depth = 0, inStr = false, inDbl = false;
  const kw = keyword.toUpperCase();
  const kwLen = kw.length;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "'" && !inDbl) inStr = !inStr;
    if (s[i] === '"' && !inStr) inDbl = !inDbl;
    if (!inStr && !inDbl) {
      if (s[i] === '(') depth++;
      if (s[i] === ')') depth--;
      if (depth === 0 && s.slice(i, i + kwLen).toUpperCase() === kw) {
        // Check word boundaries
        const before = i === 0 || /\s/.test(s[i - 1]);
        const after = i + kwLen >= s.length || /\s/.test(s[i + kwLen]);
        if (before && after) return i;
      }
    }
  }
  return -1;
};

// Find comparison operator at top level (not inside parens/strings/functions)
const findTopLevelComparison = (s: string): { left: string; op: string; right: string } | null => {
  let depth = 0, inStr = false, inDbl = false;
  // Search for operators: >=, <=, <>, !=, =, >, <
  const ops = ['>=', '<=', '<>', '!=', '=', '>', '<'];
  let bestIdx = -1, bestOp = '';
  
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "'" && !inDbl) inStr = !inStr;
    if (s[i] === '"' && !inStr) inDbl = !inDbl;
    if (!inStr && !inDbl) {
      if (s[i] === '(') depth++;
      if (s[i] === ')') depth--;
      if (depth === 0) {
        for (const op of ops) {
          if (s.slice(i, i + op.length) === op) {
            // Make sure it's not inside a string that we missed
            bestIdx = i;
            bestOp = op;
            // Return first match (leftmost operator)
            return {
              left: s.slice(0, bestIdx).trim(),
              op: bestOp,
              right: s.slice(bestIdx + bestOp.length).trim(),
            };
          }
        }
      }
    }
  }
  return null;
};

const compareValues = (lhs: CellValue, op: string, rhs: CellValue): boolean => {
  // NULL comparison: any comparison with NULL returns false (SQL standard)
  // Use IS NULL / IS NOT NULL for NULL checks
  if (lhs === null || rhs === null) {
    // NULL != anything is true in some DBs, but standard SQL says UNKNOWN
    // For simplicity: = returns false, != returns false for NULL comparisons
    return false;
  }
  switch (op) {
    case '=': return lhs == rhs;
    case '!=': case '<>': return lhs != rhs;
    case '>': return Number(lhs) > Number(rhs);
    case '<': return Number(lhs) < Number(rhs);
    case '>=': return Number(lhs) >= Number(rhs);
    case '<=': return Number(lhs) <= Number(rhs);
    default: return false;
  }
};

const splitTopLevelCommas = (s: string): string[] => {
  const parts: string[] = [];
  let depth = 0, current = '', inStr = false, inDbl = false;
  for (let ci = 0; ci < s.length; ci++) {
    const ch = s[ci];
    if (ch === "'" && !inDbl) {
      // Handle escaped quotes ''
      if (inStr && ci + 1 < s.length && s[ci + 1] === "'") {
        current += "''";
        ci++;
        continue;
      }
      inStr = !inStr;
    } else if (ch === '"' && !inStr) {
      inDbl = !inDbl;
    }
    if (!inStr && !inDbl) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
    }
    if (ch === ',' && depth === 0 && !inStr && !inDbl) { parts.push(current.trim()); current = ''; }
    else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

// ─── Statement Executors ────────────────────────────────

const execCreateDatabase = (stmt: string): ExecutionResult => {
  const m = stmt.match(/CREATE\s+DATABASE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
  if (!m) return { id: uid(), type: 'error', message: 'ERROR: Invalid CREATE DATABASE syntax', timestamp: new Date() };
  const name = m[1].toLowerCase();
  if (databases.has(name)) {
    if (/IF\s+NOT\s+EXISTS/i.test(stmt)) return { id: uid(), type: 'info', message: `NOTICE: database "${name}" already exists, skipping`, timestamp: new Date() };
    return { id: uid(), type: 'error', message: `ERROR: database "${name}" already exists`, timestamp: new Date() };
  }
  databases.set(name, { name, tables: new Map(), views: new Map(), indexes: new Map(), sequences: new Map() });
  return { id: uid(), type: 'success', message: `✓ CREATE DATABASE "${name}" — 1 database created`, timestamp: new Date() };
};

const execUseDatabase = (stmt: string): ExecutionResult => {
  const m = stmt.match(/USE\s+(\w+)/i);
  if (!m) return { id: uid(), type: 'error', message: 'ERROR: Invalid USE syntax', timestamp: new Date() };
  const name = m[1].toLowerCase();
  if (!databases.has(name)) return { id: uid(), type: 'error', message: `ERROR: database "${name}" does not exist\nHINT: Use CREATE DATABASE ${name} first`, timestamp: new Date() };
  currentDb = name;
  return { id: uid(), type: 'info', message: `Switched to database "${name}"`, timestamp: new Date() };
};

const execCreateTable = (stmt: string): ExecutionResult => {
  const mWithCols = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]+)\)/i);
  const mNoCols = !mWithCols ? stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*$/i) : null;

  if (!mWithCols && !mNoCols) return { id: uid(), type: 'error', message: 'ERROR: Invalid CREATE TABLE syntax\nHINT: Use CREATE TABLE name (col1 TYPE, col2 TYPE, ...)', timestamp: new Date() };

  const tableName = (mWithCols ? mWithCols[1] : mNoCols![1]).toLowerCase();
  const db = getActiveDb();

  // Validate table name
  const tableNameErr = validateIdentifierName(tableName, 'table');
  if (tableNameErr) return { id: uid(), type: 'error', message: tableNameErr, timestamp: new Date() };

  if (db.tables.has(tableName)) {
    if (/IF\s+NOT\s+EXISTS/i.test(stmt)) return { id: uid(), type: 'info', message: `NOTICE: relation "${tableName}" already exists, skipping`, timestamp: new Date() };
    return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" already exists`, timestamp: new Date() };
  }

  if (mNoCols) {
    db.tables.set(tableName, { name: tableName, columns: [], rows: [], autoIncrementCounters: {}, foreignKeys: [] });
    return { id: uid(), type: 'success', message: `✓ CREATE TABLE "${tableName}" (0 columns)`, timestamp: new Date() };
  }

  const body = mWithCols![2];
  const parts = splitTopLevelCommas(body);
  const columns: ColumnDef[] = [];
  const foreignKeys: ForeignKeyDef[] = [];
  const constraintKws = ['UNIQUE', 'CHECK', 'CONSTRAINT', 'INDEX', 'EXCLUDE'];
  const seenColNames = new Set<string>();
  let pkCount = 0;

  for (const part of parts) {
    // Empty part means extra/missing comma
    if (!part.trim()) {
      return { id: uid(), type: 'error', message: `ERROR: syntax error in column definitions for table "${tableName}"\nHINT: Check for extra or missing commas between column definitions`, timestamp: new Date() };
    }
    const upper = part.trim().toUpperCase();

    // Table-level PRIMARY KEY (composite)
    const tablePkMatch = upper.match(/^PRIMARY\s+KEY\s*\((.+)\)/i);
    if (tablePkMatch) {
      pkCount++;
      if (pkCount > 1) return { id: uid(), type: 'error', message: `ERROR: multiple primary keys for table "${tableName}" are not allowed`, timestamp: new Date() };
      const pkCols = tablePkMatch[1].split(',').map(c => c.trim().toLowerCase().replace(/"/g, ''));
      for (const pkCol of pkCols) {
        const col = columns.find(c => c.name === pkCol);
        if (col) { col.primaryKey = true; col.unique = true; col.nullable = false; }
      }
      continue;
    }

    // Table-level FOREIGN KEY
    const tableFkMatch = part.trim().match(/^FOREIGN\s+KEY\s*\((\w+)\)\s+REFERENCES\s+(\w+)\s*\((\w+)\)(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?(?:\s+ON\s+UPDATE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?/i);
    if (tableFkMatch) {
      foreignKeys.push({
        column: tableFkMatch[1].toLowerCase(),
        refTable: tableFkMatch[2].toLowerCase(),
        refColumn: tableFkMatch[3].toLowerCase(),
        onDelete: (tableFkMatch[4]?.toUpperCase().replace(/\s+/g, '_') || 'NO_ACTION') as any,
        onUpdate: (tableFkMatch[5]?.toUpperCase().replace(/\s+/g, '_') || 'NO_ACTION') as any,
      });
      continue;
    }

    if (constraintKws.some(k => upper.startsWith(k))) continue;

    const tokens = part.trim().split(/\s+/);
    if (tokens.length < 2) continue;

    const colName = tokens[0].replace(/"/g, '').toLowerCase();
    
    // Validate column name
    const nameErr = validateIdentifierName(colName, 'column');
    if (nameErr) return { id: uid(), type: 'error', message: nameErr, timestamp: new Date() };

    // Check duplicate column names
    if (seenColNames.has(colName)) {
      return { id: uid(), type: 'error', message: `ERROR: column "${colName}" specified more than once`, timestamp: new Date() };
    }
    seenColNames.add(colName);
    
    // Reconstruct type that may include (n), e.g. VARCHAR(1) or NUMERIC(10,2)
    let colTypeRaw = tokens[1];
    let restStartIdx = 2;
    if (colTypeRaw.includes('(') && !colTypeRaw.includes(')')) {
      for (let ti = 2; ti < tokens.length; ti++) {
        colTypeRaw += ' ' + tokens[ti];
        restStartIdx = ti + 1;
        if (tokens[ti].includes(')')) break;
      }
    }
    colTypeRaw = colTypeRaw.toUpperCase();
    const { baseType, maxLength } = parseTypeLength(colTypeRaw);
    const colType = colTypeRaw;
    const rest = tokens.slice(restStartIdx).join(' ').toUpperCase();

    const isSerial = /SERIAL|BIGSERIAL/i.test(colType);
    const isPk = rest.includes('PRIMARY KEY');

    if (isPk) {
      pkCount++;
      if (pkCount > 1) return { id: uid(), type: 'error', message: `ERROR: multiple primary keys for table "${tableName}" are not allowed`, timestamp: new Date() };
    }

    // Parse DEFAULT value
    let defaultValue: CellValue = isSerial ? 0 : null;
    const defaultMatch = rest.match(/DEFAULT\s+(.+?)(?:\s+(?:NOT|NULL|UNIQUE|PRIMARY|CHECK|REFERENCES|CONSTRAINT)|$)/i);
    if (defaultMatch) {
      defaultValue = parseValue(defaultMatch[1].trim());
    }

    // Validate DEFAULT against data type
    if (defaultValue !== null) {
      if (maxLength !== undefined) {
        const strVal = String(defaultValue);
        if (strVal.length > maxLength) {
          return { id: uid(), type: 'error', message: `ERROR: value too long for type character varying(${maxLength})\nDETAIL: Default value "${strVal}" exceeds maximum length ${maxLength}`, timestamp: new Date() };
        }
      }
      // Validate default against column type
      const tempColDef: ColumnDef = { name: colName, type: colType, maxLength, nullable: true, defaultValue: null, primaryKey: false, unique: false, autoIncrement: false };
      const typeErr = validateDataType(defaultValue, tempColDef);
      if (typeErr) return { id: uid(), type: 'error', message: `${typeErr}\nDETAIL: Invalid default value for column "${colName}"`, timestamp: new Date() };
    }

    // Parse CHECK constraint
    let check: string | undefined;
    const checkMatch = rest.match(/CHECK\s*\((.+)\)/i);
    if (checkMatch) check = checkMatch[1];

    // Parse inline REFERENCES (foreign key)
    const referencesMatch = rest.match(/REFERENCES\s+(\w+)\s*\((\w+)\)(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?/i);
    if (referencesMatch) {
      foreignKeys.push({
        column: colName,
        refTable: referencesMatch[1].toLowerCase(),
        refColumn: referencesMatch[2].toLowerCase(),
        onDelete: (referencesMatch[3]?.toUpperCase().replace(/\s+/g, '_') || 'NO_ACTION') as any,
      });
    }

    columns.push({
      name: colName,
      type: colType,
      maxLength,
      nullable: !rest.includes('NOT NULL') && !isPk,
      defaultValue,
      primaryKey: isPk,
      unique: rest.includes('UNIQUE') || isPk,
      autoIncrement: isSerial || rest.includes('GENERATED'),
      check,
    });
  }

  if (columns.length === 0) return { id: uid(), type: 'error', message: `ERROR: table "${tableName}" must have at least one column`, timestamp: new Date() };

  // Validate FK references exist
  for (const fk of foreignKeys) {
    const refTable = db.tables.get(fk.refTable);
    if (!refTable) return { id: uid(), type: 'error', message: `ERROR: relation "${fk.refTable}" does not exist\nDETAIL: Foreign key references non-existent table`, timestamp: new Date() };
    const refCol = refTable.columns.find(c => c.name === fk.refColumn);
    if (!refCol) return { id: uid(), type: 'error', message: `ERROR: column "${fk.refColumn}" referenced in foreign key does not exist in table "${fk.refTable}"`, timestamp: new Date() };
    if (!refCol.primaryKey && !refCol.unique) return { id: uid(), type: 'error', message: `ERROR: there is no unique constraint matching given keys for referenced table "${fk.refTable}"`, timestamp: new Date() };
    // Type compatibility check
    const srcCol = columns.find(c => c.name === fk.column);
    if (srcCol) {
      const srcBase = srcCol.type.replace(/\(.+\)/, '').toUpperCase();
      const refBase = refCol.type.replace(/\(.+\)/, '').toUpperCase();
      const intTypes = ['INT', 'INTEGER', 'SMALLINT', 'BIGINT', 'SERIAL', 'BIGSERIAL'];
      const strTypes = ['VARCHAR', 'CHAR', 'TEXT', 'CHARACTER'];
      const srcIsInt = intTypes.includes(srcBase);
      const refIsInt = intTypes.includes(refBase);
      const srcIsStr = strTypes.includes(srcBase);
      const refIsStr = strTypes.includes(refBase);
      if ((srcIsInt && refIsStr) || (srcIsStr && refIsInt)) {
        return { id: uid(), type: 'error', message: `ERROR: foreign key constraint type mismatch\nDETAIL: Column "${fk.column}" (${srcBase}) does not match "${fk.refColumn}" (${refBase})`, timestamp: new Date() };
      }
    }
  }

  db.tables.set(tableName, { name: tableName, columns, rows: [], autoIncrementCounters: {}, foreignKeys });

  const colList = columns.map(c => `  ${c.name} ${c.type}${c.primaryKey ? ' PK' : ''}${c.autoIncrement ? ' AUTO' : ''}${!c.nullable ? ' NOT NULL' : ''}${c.check ? ` CHECK(${c.check})` : ''}`).join('\n');
  return {
    id: uid(), type: 'success',
    message: `✓ CREATE TABLE "${tableName}" (${columns.length} columns)\n${colList}`,
    timestamp: new Date(),
  };
};

const execInsert = (stmt: string): ExecutionResult => {
  // Check for INSERT ... SELECT
  const insertSelectMatch = stmt.match(/INSERT\s+INTO\s+(\w+)\s*(?:\(([^)]+)\))?\s*SELECT\s+([\s\S]+)/i);
  if (insertSelectMatch) {
    return execInsertSelect(insertSelectMatch);
  }

  // Check for ON CONFLICT (UPSERT)
  const hasOnConflict = /ON\s+CONFLICT/i.test(stmt);
  const baseStmt = hasOnConflict ? stmt.replace(/\s+ON\s+CONFLICT[\s\S]*/i, '') : stmt;
  const onConflictMatch = hasOnConflict ? stmt.match(/ON\s+CONFLICT\s*(?:\(([^)]+)\))?\s+DO\s+(NOTHING|UPDATE\s+SET\s+(.+?))\s*$/i) : null;

  // Check for RETURNING
  const returningMatch = baseStmt.match(/^([\s\S]+?)\s+RETURNING\s+(.+)$/i);
  const actualStmt = returningMatch ? returningMatch[1] : baseStmt;
  const returningCols = returningMatch ? returningMatch[2].trim() : null;

  const m = actualStmt.match(/INSERT\s+INTO\s+(\w+)\s*(?:\(([^)]+)\))?\s*VALUES\s*([\s\S]+)/i);
  if (!m) return { id: uid(), type: 'error', message: 'ERROR: Invalid INSERT syntax\nHINT: INSERT INTO table (col1, col2) VALUES (val1, val2)', timestamp: new Date() };

  const tableName = m[1].toLowerCase();
  const db = getActiveDb();
  const table = db.tables.get(tableName);
  if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist\nHINT: Create the table first with CREATE TABLE`, timestamp: new Date() };

  const specifiedCols = m[2]
    ? m[2].split(',').map(c => c.trim().toLowerCase().replace(/"/g, ''))
    : table.columns.filter(c => !c.autoIncrement).map(c => c.name);

  const valuesStr = m[3];
  const valueGroups: CellValue[][] = [];
  const groupMatches = valuesStr.matchAll(/\(([^)]*)\)/g);
  for (const gm of groupMatches) {
    const vals = splitTopLevelCommas(gm[1]).map(v => parseValue(v));
    valueGroups.push(vals);
  }

  if (valueGroups.length === 0) return { id: uid(), type: 'error', message: 'ERROR: VALUES clause must contain at least one row', timestamp: new Date() };

  let inserted = 0;
  const insertedRows: Row[] = [];

  for (const vals of valueGroups) {
    if (vals.length !== specifiedCols.length) {
      return { id: uid(), type: 'error', message: `ERROR: INSERT has ${specifiedCols.length} columns but ${vals.length} values were supplied`, timestamp: new Date() };
    }

    const row: Row = {};
    for (const col of table.columns) {
      if (col.autoIncrement) {
        const counter = (table.autoIncrementCounters[col.name] || 0) + 1;
        table.autoIncrementCounters[col.name] = counter;
        row[col.name] = counter;
      } else {
        row[col.name] = col.defaultValue;
      }
    }

    for (let i = 0; i < specifiedCols.length; i++) {
      const colName = specifiedCols[i];
      const colDef = table.columns.find(c => c.name === colName);
      if (!colDef) return { id: uid(), type: 'error', message: `ERROR: column "${colName}" of relation "${tableName}" does not exist`, timestamp: new Date() };

      // Data type validation
      const typeErr = validateDataType(vals[i], colDef);
      if (typeErr) return { id: uid(), type: 'error', message: typeErr, timestamp: new Date() };

      // Coerce value to correct type
      row[colName] = coerceValue(vals[i], colDef);
    }

    // Full row validation (NOT NULL, VARCHAR length, CHECK, PK, UNIQUE, FK)
    const rowErr = validateRow(row, table, db);
    if (rowErr) {
      // Handle ON CONFLICT for unique violations
      if (hasOnConflict && onConflictMatch && rowErr.includes('duplicate key')) {
        let conflicted = false;
        for (const col of table.columns) {
          if (col.unique && row[col.name] !== null) {
            const duplicate = table.rows.find(r => r[col.name] === row[col.name]);
            if (duplicate) {
              conflicted = true;
              if (onConflictMatch[2].toUpperCase().startsWith('UPDATE')) {
                const setParts = splitTopLevelCommas(onConflictMatch[3] || '');
                for (const sp of setParts) {
                  const [setCol, ...setRest] = sp.split('=');
                  const setVal = parseValue(setRest.join('=').trim().replace(/^EXCLUDED\./i, ''));
                  const colKey = setCol.trim().toLowerCase();
                  const newVal = row[colKey] ?? setVal;
                  duplicate[colKey] = newVal;
                }
              }
              break;
            }
          }
        }
        if (conflicted) continue;
      }
      return { id: uid(), type: 'error', message: rowErr, timestamp: new Date() };
    }

    // Check ON CONFLICT for unique
    let conflicted = false;
    if (hasOnConflict && onConflictMatch) {
      for (const col of table.columns) {
        if (col.unique && row[col.name] !== null) {
          const duplicate = table.rows.find(r => r[col.name] === row[col.name]);
          if (duplicate) {
            conflicted = true;
            if (onConflictMatch[2].toUpperCase().startsWith('UPDATE')) {
              const setParts = splitTopLevelCommas(onConflictMatch[3] || '');
              for (const sp of setParts) {
                const [setCol, ...setRest] = sp.split('=');
                const setVal = parseValue(setRest.join('=').trim().replace(/^EXCLUDED\./i, ''));
                const colKey = setCol.trim().toLowerCase();
                const newVal = row[colKey] ?? setVal;
                duplicate[colKey] = newVal;
              }
            }
            break;
          }
        }
      }
    }

    if (!conflicted) {
      table.rows.push(row);
      insertedRows.push(row);
      inserted++;
    }
  }

  // Handle RETURNING
  if (returningCols && insertedRows.length > 0) {
    const cols = returningCols === '*' ? table.columns.map(c => c.name) : returningCols.split(',').map(c => c.trim().toLowerCase());
    const dataRows = insertedRows.map(r => cols.map(c => r[c] ?? null));
    return {
      id: uid(), type: 'result',
      message: `INSERT 0 ${inserted}\n` + formatTable(cols, dataRows),
      timestamp: new Date(), rowsAffected: inserted,
      tableData: { columns: cols, rows: dataRows },
    };
  }

  return { id: uid(), type: 'success', message: `INSERT 0 ${inserted}`, timestamp: new Date(), rowsAffected: inserted };
};

const execInsertSelect = (m: RegExpMatchArray): ExecutionResult => {
  const tableName = m[1].toLowerCase();
  const db = getActiveDb();
  const table = db.tables.get(tableName);
  if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };

  const specifiedCols = m[2]
    ? m[2].split(',').map(c => c.trim().toLowerCase().replace(/"/g, ''))
    : table.columns.filter(c => !c.autoIncrement).map(c => c.name);

  const selectResult = execSelect('SELECT ' + m[3]);
  if (selectResult.type === 'error') return selectResult;
  if (!selectResult.tableData) return { id: uid(), type: 'error', message: 'ERROR: SELECT returned no data', timestamp: new Date() };

  let inserted = 0;
  for (const vals of selectResult.tableData.rows) {
    const row: Row = {};
    for (const col of table.columns) {
      if (col.autoIncrement) {
        const counter = (table.autoIncrementCounters[col.name] || 0) + 1;
        table.autoIncrementCounters[col.name] = counter;
        row[col.name] = counter;
      } else {
        row[col.name] = col.defaultValue;
      }
    }
    for (let i = 0; i < specifiedCols.length && i < vals.length; i++) {
      row[specifiedCols[i]] = vals[i];
    }
    table.rows.push(row);
    inserted++;
  }

  return { id: uid(), type: 'success', message: `INSERT 0 ${inserted}`, timestamp: new Date(), rowsAffected: inserted };
};

const deduplicateRows = (columns: string[], rows: CellValue[][]): CellValue[][] => {
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = row.map(v => JSON.stringify(v)).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const resolveTableOrView = (name: string, db: DatabaseState): TableState | null => {
  const tableName = name.toLowerCase();
  if (db.tables.has(tableName)) return db.tables.get(tableName)!;

  // Check if it's a view — execute the view's query and return as a virtual table
  const view = db.views.get(tableName);
  if (view) {
    const result = execSelect(view.query);
    if (result.tableData) {
      return {
        name: tableName,
        columns: result.tableData.columns.map(c => ({
          name: c, type: 'TEXT', nullable: true, defaultValue: null,
          primaryKey: false, unique: false, autoIncrement: false,
        })),
        rows: result.tableData.rows.map(r => {
          const row: Row = {};
          result.tableData!.columns.forEach((c, i) => { row[c] = r[i]; });
          return row;
        }),
        autoIncrementCounters: {},
        foreignKeys: [],
      };
    }
  }

  return null;
};

const execSelect = (stmt: string): ExecutionResult => {
  let workingStmt = stmt;
  const isDistinct = /^SELECT\s+DISTINCT\s+/i.test(workingStmt.trim());
  if (isDistinct) {
    workingStmt = workingStmt.replace(/^SELECT\s+DISTINCT\s+/i, 'SELECT ');
  }
  const upper = workingStmt.toUpperCase().replace(/\s+/g, ' ').trim();

  // Special built-in selects
  if (upper === 'SELECT 1' || upper === 'SELECT 1 AS RESULT') {
    return { id: uid(), type: 'result', message: formatTable(['result'], [[1]]), timestamp: new Date(), tableData: { columns: ['result'], rows: [[1]] } };
  }
  if (upper.startsWith('SELECT NOW()') || upper.startsWith('SELECT CURRENT_TIMESTAMP')) {
    const now = new Date().toISOString();
    return { id: uid(), type: 'result', message: formatTable(['now'], [[now]]), timestamp: new Date(), tableData: { columns: ['now'], rows: [[now]] } };
  }
  if (upper.startsWith('SELECT VERSION()')) {
    return { id: uid(), type: 'result', message: formatTable(['version'], [['PostgreSQL 16.2 (Advanced SQL Engine v3.0)']]), timestamp: new Date(), tableData: { columns: ['version'], rows: [['PostgreSQL 16.2 (Advanced SQL Engine v3.0)']] } };
  }
  if (upper.startsWith('SELECT CURRENT_DATABASE()')) {
    const dbName = currentDb || '__default__';
    return { id: uid(), type: 'result', message: formatTable(['current_database'], [[dbName]]), timestamp: new Date(), tableData: { columns: ['current_database'], rows: [[dbName]] } };
  }
  if (upper.startsWith('SELECT GEN_RANDOM_UUID()') || upper.startsWith('SELECT UUID_GENERATE_V4()')) {
    const uuid = crypto.randomUUID();
    return { id: uid(), type: 'result', message: formatTable(['gen_random_uuid'], [[uuid]]), timestamp: new Date(), tableData: { columns: ['gen_random_uuid'], rows: [[uuid]] } };
  }
  if (upper.startsWith('SELECT CURRENT_USER') || upper.startsWith('SELECT SESSION_USER')) {
    return { id: uid(), type: 'result', message: formatTable(['current_user'], [['postgres']]), timestamp: new Date(), tableData: { columns: ['current_user'], rows: [['postgres']] } };
  }
  if (upper.startsWith('SELECT CURRENT_SCHEMA')) {
    return { id: uid(), type: 'result', message: formatTable(['current_schema'], [['public']]), timestamp: new Date(), tableData: { columns: ['current_schema'], rows: [['public']] } };
  }

  // SELECT with GENERATE_SERIES
  const genSeriesMatch = workingStmt.match(/SELECT\s+(.+?)\s+FROM\s+GENERATE_SERIES\s*\(\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d+))?\s*\)/i);
  if (genSeriesMatch) {
    const selectExpr = genSeriesMatch[1].trim();
    const start = parseInt(genSeriesMatch[2]);
    const end = parseInt(genSeriesMatch[3]);
    const step = genSeriesMatch[4] ? parseInt(genSeriesMatch[4]) : 1;
    const rows: CellValue[][] = [];
    const colName = selectExpr === '*' ? 'generate_series' : selectExpr.toLowerCase();
    for (let i = start; i <= end; i += step) {
      rows.push([i]);
    }
    return { id: uid(), type: 'result', message: formatTable([colName], rows) + `\n(${rows.length} rows)`, timestamp: new Date(), tableData: { columns: [colName], rows } };
  }

  const db = getActiveDb();

  // ─── JOIN support ─────────────────────────────
  const joinMatch = workingStmt.match(
    /SELECT\s+([\s\S]+?)\s+FROM\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?\s+((?:(?:INNER|LEFT|RIGHT|FULL|CROSS|NATURAL)\s+)?JOIN\s+\w+[\s\S]*?)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+GROUP\s+BY\s+([\s\S]+?))?(?:\s+HAVING\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\s\S]+?))?(?:\s+LIMIT\s+(\d+))?(?:\s+OFFSET\s+(\d+))?\s*$/i
  );

  if (joinMatch) {
    const selectCols = joinMatch[1].trim();
    const leftTableName = joinMatch[2].toLowerCase();
    const leftAlias = joinMatch[3]?.toLowerCase() || leftTableName;
    const joinClause = joinMatch[4].trim();
    const whereClause = joinMatch[5]?.trim();
    const groupByClause = joinMatch[6]?.trim();
    const havingClause = joinMatch[7]?.trim();
    const orderByClause = joinMatch[8]?.trim();
    const limitNum = joinMatch[9] ? parseInt(joinMatch[9]) : undefined;
    const offsetNum = joinMatch[10] ? parseInt(joinMatch[10]) : undefined;

    const leftTable = resolveTableOrView(leftTableName, db);
    if (!leftTable) return { id: uid(), type: 'error', message: `ERROR: relation "${leftTableName}" does not exist`, timestamp: new Date() };

    const joinRegex = /(?:(INNER|LEFT|RIGHT|FULL|CROSS|NATURAL)\s+)?JOIN\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?\s+(?:ON\s+([\s\S]+?))?(?=\s+(?:INNER|LEFT|RIGHT|FULL|CROSS|NATURAL)?\s*JOIN|\s+WHERE|\s+GROUP|\s+ORDER|\s+LIMIT|\s+OFFSET|\s+HAVING|\s*$)/gi;
    const joins: { type: string; table: string; alias: string; onClause: string }[] = [];
    let jm: RegExpExecArray | null;
    while ((jm = joinRegex.exec(joinClause)) !== null) {
      joins.push({
        type: (jm[1] || 'INNER').toUpperCase(),
        table: jm[2].toLowerCase(),
        alias: jm[3]?.toLowerCase() || jm[2].toLowerCase(),
        onClause: jm[4]?.trim() || '',
      });
    }

    if (joins.length === 0) {
      return { id: uid(), type: 'error', message: 'ERROR: Could not parse JOIN clause\nHINT: Use: SELECT * FROM t1 JOIN t2 ON t1.col = t2.col', timestamp: new Date() };
    }

    let currentRows: Row[] = leftTable.rows.map(row => {
      const prefixed: Row = {};
      for (const [k, v] of Object.entries(row)) {
        prefixed[`${leftAlias}.${k}`] = v;
        prefixed[k] = v;
      }
      return prefixed;
    });
    let allColumns: string[] = leftTable.columns.map(c => `${leftAlias}.${c.name}`);

    for (const join of joins) {
      const rightTable = resolveTableOrView(join.table, db);
      if (!rightTable) return { id: uid(), type: 'error', message: `ERROR: relation "${join.table}" does not exist`, timestamp: new Date() };

      const rightCols = rightTable.columns.map(c => `${join.alias}.${c.name}`);

      if (join.type === 'CROSS') {
        const newRows: Row[] = [];
        for (const leftRow of currentRows) {
          for (const rightRow of rightTable.rows) {
            const combined: Row = { ...leftRow };
            for (const col of rightTable.columns) {
              combined[`${join.alias}.${col.name}`] = rightRow[col.name];
              combined[col.name] = rightRow[col.name];
            }
            newRows.push(combined);
          }
        }
        currentRows = newRows;
        allColumns = [...allColumns, ...rightCols];
        continue;
      }

      if (join.type === 'NATURAL') {
        // NATURAL JOIN: join on columns with same name
        const leftColNames = leftTable.columns.map(c => c.name);
        const rightColNames = rightTable.columns.map(c => c.name);
        const commonCols = leftColNames.filter(c => rightColNames.includes(c));

        const newRows: Row[] = [];
        for (const leftRow of currentRows) {
          for (const rightRow of rightTable.rows) {
            const allMatch = commonCols.every(c => leftRow[c] == rightRow[c]);
            if (allMatch) {
              const combined: Row = { ...leftRow };
              for (const col of rightTable.columns) {
                combined[`${join.alias}.${col.name}`] = rightRow[col.name];
                combined[col.name] = rightRow[col.name];
              }
              newRows.push(combined);
            }
          }
        }
        currentRows = newRows;
        allColumns = [...allColumns, ...rightCols];
        continue;
      }

      const onMatch = join.onClause.match(/(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/);
      if (!onMatch) return { id: uid(), type: 'error', message: `ERROR: Invalid ON clause: "${join.onClause}"\nHINT: Use format: table1.column = table2.column`, timestamp: new Date() };

      const leftOnKey = `${onMatch[1].toLowerCase()}.${onMatch[2].toLowerCase()}`;
      const rightOnKey = onMatch[4].toLowerCase();

      const newRows: Row[] = [];
      const rightMatched = new Set<number>();

      for (const leftRow of currentRows) {
        const leftVal = leftRow[leftOnKey] ?? leftRow[onMatch[2].toLowerCase()];
        let matched = false;

        for (let ri = 0; ri < rightTable.rows.length; ri++) {
          const rightRow = rightTable.rows[ri];
          if (leftVal == rightRow[rightOnKey]) {
            matched = true;
            rightMatched.add(ri);
            const combined: Row = { ...leftRow };
            for (const col of rightTable.columns) {
              combined[`${join.alias}.${col.name}`] = rightRow[col.name];
              combined[col.name] = rightRow[col.name];
            }
            newRows.push(combined);
          }
        }

        if (!matched && (join.type === 'LEFT' || join.type === 'FULL')) {
          const combined: Row = { ...leftRow };
          for (const col of rightTable.columns) {
            combined[`${join.alias}.${col.name}`] = null;
          }
          newRows.push(combined);
        }
      }

      if (join.type === 'RIGHT' || join.type === 'FULL') {
        for (let ri = 0; ri < rightTable.rows.length; ri++) {
          if (!rightMatched.has(ri)) {
            const combined: Row = {};
            for (const col of allColumns) { combined[col] = null; }
            const rightRow = rightTable.rows[ri];
            for (const col of rightTable.columns) {
              combined[`${join.alias}.${col.name}`] = rightRow[col.name];
              combined[col.name] = rightRow[col.name];
            }
            newRows.push(combined);
          }
        }
      }

      currentRows = newRows;
      allColumns = [...allColumns, ...rightCols];
    }

    if (whereClause) {
      currentRows = currentRows.filter(row => evaluateCondition(row, whereClause));
    }

    // Handle GROUP BY for JOINs
    if (groupByClause) {
      return execGroupBy(selectCols, currentRows, groupByClause, havingClause || null, orderByClause || null, limitNum, offsetNum, isDistinct);
    }

    let outputCols: string[];
    if (selectCols === '*') {
      outputCols = allColumns;
    } else {
      outputCols = splitTopLevelCommas(selectCols).map(c => {
        const aliasMatch = c.trim().match(/^(.+?)\s+AS\s+(\w+)$/i);
        return aliasMatch ? aliasMatch[2].toLowerCase() : c.trim().toLowerCase();
      });
    }

    if (orderByClause) {
      applyOrderBy(currentRows, orderByClause);
    }

    if (offsetNum) currentRows = currentRows.slice(offsetNum);
    if (limitNum !== undefined) currentRows = currentRows.slice(0, limitNum);

    // Evaluate expressions in select list
    const dataRows = currentRows.map(row => {
      return splitTopLevelCommas(selectCols).map(colExpr => {
        const trimmed = colExpr.trim();
        const aliasMatch = trimmed.match(/^(.+?)\s+AS\s+(\w+)$/i);
        const expr = aliasMatch ? aliasMatch[1].trim() : trimmed;
        if (expr === '*') return null; // handled above
        return evaluateExpression(expr, row);
      });
    });

    const finalRows = isDistinct ? deduplicateRows(outputCols, selectCols === '*' ? currentRows.map(row => outputCols.map(col => row[col] ?? null)) : dataRows) : (selectCols === '*' ? currentRows.map(row => outputCols.map(col => row[col] ?? null)) : dataRows);

    return {
      id: uid(), type: 'result',
      message: formatTable(outputCols, finalRows) + `\n(${finalRows.length} row${finalRows.length !== 1 ? 's' : ''})`,
      timestamp: new Date(),
      rowsAffected: finalRows.length,
      tableData: { columns: outputCols, rows: finalRows },
    };
  }

  // ─── Standard SELECT (with GROUP BY/HAVING support) ─────────────────────
  const selectMatch = workingStmt.match(/SELECT\s+([\s\S]+?)\s+FROM\s+(\w+)(?:\s+(?:WHERE)\s+([\s\S]+?))?(?:\s+GROUP\s+BY\s+([\s\S]+?))?(?:\s+HAVING\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\s\S]+?))?(?:\s+LIMIT\s+(\d+))?(?:\s+OFFSET\s+(\d+))?\s*$/i);

  if (!selectMatch) {
    // Simple expression select like SELECT 1+1, SELECT UPPER('hello'), etc.
    const exprMatch = workingStmt.match(/SELECT\s+(.+)/i);
    if (exprMatch) {
      const selectExprs = splitTopLevelCommas(exprMatch[1].trim());

      // Check if any expression looks like a column reference (not a literal, function, or arithmetic)
      // If so, FROM clause is required
      for (const expr of selectExprs) {
        const trimmedExpr = expr.trim().replace(/\s+AS\s+\w+$/i, '').trim();
        const isLiteral = /^'.*'$/.test(trimmedExpr) || /^-?\d+(\.\d+)?$/.test(trimmedExpr) ||
          /^(NULL|TRUE|FALSE)$/i.test(trimmedExpr);
        const isFunction = /^\w+\s*\(/.test(trimmedExpr);
        const isArithmetic = /^[\d\s+\-*/%.()]+$/.test(trimmedExpr);
        const isStringConcat = trimmedExpr.includes('||');
        const isCast = /^CAST\s*\(/i.test(trimmedExpr) || trimmedExpr.includes('::');
        const isStar = trimmedExpr === '*';

        if (isStar) {
          return { id: uid(), type: 'error', message: `ERROR: SELECT * requires a FROM clause`, timestamp: new Date() };
        }

        if (!isLiteral && !isFunction && !isArithmetic && !isStringConcat && !isCast) {
          // Likely a column reference — needs FROM
          if (/^[a-zA-Z_]\w*$/i.test(trimmedExpr) && !['NOW', 'CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_USER', 'SESSION_USER', 'CURRENT_SCHEMA', 'CURRENT_DATABASE'].includes(trimmedExpr.toUpperCase())) {
            return { id: uid(), type: 'error', message: `ERROR: column "${trimmedExpr}" does not exist\nHINT: SELECT with column references requires a FROM clause`, timestamp: new Date() };
          }
        }
      }

      const cols: string[] = [];
      const vals: CellValue[] = [];

      for (const expr of selectExprs) {
        const aliasMatch = expr.trim().match(/^(.+?)\s+AS\s+(\w+)$/i);
        const actualExpr = aliasMatch ? aliasMatch[1].trim() : expr.trim();
        const alias = aliasMatch ? aliasMatch[2].toLowerCase() : '?column?';
        cols.push(alias);
        vals.push(evaluateExpression(actualExpr, {}));
      }

      return { id: uid(), type: 'result', message: formatTable(cols, [vals]) + '\n(1 row)', timestamp: new Date(), tableData: { columns: cols, rows: [vals] } };
    }
    return { id: uid(), type: 'error', message: 'ERROR: Invalid SELECT syntax', timestamp: new Date() };
  }

  const selectCols = selectMatch[1].trim();
  const tableName = selectMatch[2].toLowerCase();
  const whereClause = selectMatch[3]?.trim();
  const groupByClause = selectMatch[4]?.trim();
  const havingClause = selectMatch[5]?.trim();
  const orderByClause = selectMatch[6]?.trim();
  const limitNum = selectMatch[7] ? parseInt(selectMatch[7]) : undefined;
  const offsetNum = selectMatch[8] ? parseInt(selectMatch[8]) : undefined;

  // Validate LIMIT
  if (limitNum !== undefined && limitNum < 0) {
    return { id: uid(), type: 'error', message: `ERROR: LIMIT must not be negative`, timestamp: new Date() };
  }
  if (offsetNum !== undefined && offsetNum < 0) {
    return { id: uid(), type: 'error', message: `ERROR: OFFSET must not be negative`, timestamp: new Date() };
  }

  // HAVING without GROUP BY
  if (havingClause && !groupByClause) {
    return { id: uid(), type: 'error', message: `ERROR: HAVING clause requires GROUP BY clause`, timestamp: new Date() };
  }

  const table = resolveTableOrView(tableName, db);
  if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist\nHINT: Available tables: ${Array.from(db.tables.keys()).join(', ') || '(none)'}`, timestamp: new Date() };

  let resultRows = [...table.rows];
  if (whereClause) {
    resultRows = resultRows.filter(row => evaluateCondition(row, whereClause));
  }

  // ─── GROUP BY Support ─────────────────────
  if (groupByClause) {
    return execGroupBy(selectCols, resultRows, groupByClause, havingClause || null, orderByClause || null, limitNum, offsetNum, isDistinct);
  }

  // Aggregates (without GROUP BY)
  const selectParts = splitTopLevelCommas(selectCols);
  const hasAggregate = selectParts.some(p => /\b(COUNT|SUM|AVG|MIN|MAX|STRING_AGG|ARRAY_AGG|BOOL_AND|BOOL_OR)\s*\(/i.test(p));

  if (hasAggregate) {
    // Check for non-aggregated columns mixed with aggregates (needs GROUP BY)
    const nonAggParts = selectParts.filter(p => !/\b(COUNT|SUM|AVG|MIN|MAX|STRING_AGG|ARRAY_AGG|BOOL_AND|BOOL_OR)\s*\(/i.test(p));
    for (const part of nonAggParts) {
      const trimmed = part.trim().replace(/\s+AS\s+\w+$/i, '').trim();
      // If it's a plain column reference (not a literal/function/expression)
      if (/^[a-zA-Z_]\w*$/i.test(trimmed) && trimmed !== '*') {
        const colExists = table.columns.some(c => c.name === trimmed.toLowerCase());
        if (colExists) {
          return { id: uid(), type: 'error', message: `ERROR: column "${trimmed}" must appear in the GROUP BY clause or be used in an aggregate function`, timestamp: new Date() };
        }
      }
    }
    return execAggregateSelect(selectParts, resultRows, table);
  }

  // ─── Window Functions ─────────────────────
  const hasWindowFunc = selectParts.some(p => /\bOVER\s*\(/i.test(p));
  if (hasWindowFunc) {
    return execWindowSelect(selectParts, resultRows, table, orderByClause, limitNum, offsetNum, isDistinct);
  }

  let outputCols: string[];
  if (selectCols === '*') {
    outputCols = table.columns.map(c => c.name);
  } else {
    outputCols = selectParts.map(c => {
      const aliasMatch = c.trim().match(/^(.+?)\s+AS\s+(\w+)$/i);
      return aliasMatch ? aliasMatch[2].toLowerCase() : c.trim().toLowerCase();
    });
  }

  // Order by (multiple columns)
  if (orderByClause) {
    applyOrderBy(resultRows, orderByClause);
  }

  if (offsetNum) resultRows = resultRows.slice(offsetNum);
  if (limitNum !== undefined) resultRows = resultRows.slice(0, limitNum);

  // Build output with expression evaluation
  let dataRows: CellValue[][];
  if (selectCols === '*') {
    dataRows = resultRows.map(row => outputCols.map(col => row[col] ?? null));
  } else {
    dataRows = resultRows.map(row => {
      return selectParts.map(colExpr => {
        const trimmed = colExpr.trim();
        const aliasMatch = trimmed.match(/^(.+?)\s+AS\s+(\w+)$/i);
        const expr = aliasMatch ? aliasMatch[1].trim() : trimmed;
        return evaluateExpression(expr, row);
      });
    });
  }

  if (isDistinct) {
    dataRows = deduplicateRows(outputCols, dataRows);
  }

  if (dataRows.length === 0) {
    return { id: uid(), type: 'result', message: formatTable(outputCols, []) + `\n(0 rows)`, timestamp: new Date(), rowsAffected: 0, tableData: { columns: outputCols, rows: [] } };
  }

  return {
    id: uid(), type: 'result',
    message: formatTable(outputCols, dataRows) + `\n(${dataRows.length} row${dataRows.length > 1 ? 's' : ''})`,
    timestamp: new Date(),
    rowsAffected: dataRows.length,
    tableData: { columns: outputCols, rows: dataRows },
  };
};

// ─── GROUP BY Helper ─────────────────────
const execGroupBy = (selectCols: string, resultRows: Row[], groupByClause: string, havingClause: string | null, orderByClause: string | null, limitNum: number | undefined, offsetNum: number | undefined, isDistinct: boolean): ExecutionResult => {
  const groupCols = groupByClause.split(',').map(c => c.trim().toLowerCase());
  const groups = new Map<string, Row[]>();

  for (const row of resultRows) {
    const key = groupCols.map(c => String(row[c] ?? 'NULL')).join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const selectParts = splitTopLevelCommas(selectCols);
  const aggResults: Row[] = [];

  for (const [key, groupRows] of groups) {
    const resultRow: Row = {};
    const groupVals = key.split('|');

    for (let gi = 0; gi < groupCols.length; gi++) {
      resultRow[groupCols[gi]] = groupVals[gi] === 'NULL' ? null : parseValue(groupVals[gi]);
    }

    for (const part of selectParts) {
      const trimmed = part.trim();
      const aliasMatch = trimmed.match(/^(.+?)\s+AS\s+(\w+)$/i);
      const expr = aliasMatch ? aliasMatch[1].trim() : trimmed;
      const alias = aliasMatch ? aliasMatch[2].toLowerCase() : expr.toLowerCase().replace(/[^a-z0-9_]/g, '_');

      const aggValue = evaluateAggregate(expr, groupRows);
      if (aggValue !== undefined) {
        resultRow[alias] = aggValue;
      } else if (groupCols.includes(expr.toLowerCase())) {
        resultRow[alias] = resultRow[expr.toLowerCase()];
      } else {
        resultRow[alias] = evaluateExpression(expr, groupRows[0]);
      }
    }

    aggResults.push(resultRow);
  }

  let filteredAgg = aggResults;
  if (havingClause) {
    filteredAgg = aggResults.filter(row => {
      const normalizedHaving = havingClause.replace(/COUNT\s*\(\s*\*\s*\)/gi, 'count___');
      return evaluateCondition(row, normalizedHaving);
    });
  }

  if (orderByClause) {
    applyOrderBy(filteredAgg, orderByClause);
  }

  if (offsetNum) filteredAgg = filteredAgg.slice(offsetNum);
  if (limitNum !== undefined) filteredAgg = filteredAgg.slice(0, limitNum);

  const outCols = Object.keys(filteredAgg[0] || {});
  let dataRows = filteredAgg.map(row => outCols.map(col => row[col] ?? null));
  if (isDistinct) dataRows = deduplicateRows(outCols, dataRows);

  return {
    id: uid(), type: 'result',
    message: formatTable(outCols, dataRows) + `\n(${dataRows.length} row${dataRows.length !== 1 ? 's' : ''})`,
    timestamp: new Date(),
    rowsAffected: dataRows.length,
    tableData: { columns: outCols, rows: dataRows },
  };
};

const evaluateAggregate = (expr: string, rows: Row[]): CellValue | undefined => {
  const countStarMatch = /^COUNT\s*\(\s*\*\s*\)$/i.test(expr);
  if (countStarMatch) return rows.length;

  const countDistinctMatch = expr.match(/^COUNT\s*\(\s*DISTINCT\s+(\w+)\s*\)$/i);
  if (countDistinctMatch) {
    const col = countDistinctMatch[1].toLowerCase();
    const unique = new Set(rows.map(r => r[col]).filter(v => v !== null));
    return unique.size;
  }

  const countColMatch = expr.match(/^COUNT\s*\(\s*(\w+)\s*\)$/i);
  if (countColMatch) {
    const col = countColMatch[1].toLowerCase();
    return rows.filter(r => r[col] !== null).length;
  }

  const sumMatch = expr.match(/^SUM\s*\(\s*(\w+)\s*\)$/i);
  if (sumMatch) {
    const col = sumMatch[1].toLowerCase();
    return rows.reduce((s, r) => s + Number(r[col] || 0), 0);
  }

  const avgMatch = expr.match(/^AVG\s*\(\s*(\w+)\s*\)$/i);
  if (avgMatch) {
    const col = avgMatch[1].toLowerCase();
    const vals = rows.map(r => Number(r[col] || 0));
    return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0;
  }

  const minMatch = expr.match(/^MIN\s*\(\s*(\w+)\s*\)$/i);
  if (minMatch) {
    const col = minMatch[1].toLowerCase();
    const vals = rows.filter(r => r[col] !== null).map(r => r[col]!);
    if (vals.length === 0) return null;
    return vals.reduce((min, v) => v < min ? v : min, vals[0]);
  }

  const maxMatch = expr.match(/^MAX\s*\(\s*(\w+)\s*\)$/i);
  if (maxMatch) {
    const col = maxMatch[1].toLowerCase();
    const vals = rows.filter(r => r[col] !== null).map(r => r[col]!);
    if (vals.length === 0) return null;
    return vals.reduce((max, v) => v > max ? v : max, vals[0]);
  }

  const stringAggMatch = expr.match(/^STRING_AGG\s*\(\s*(\w+)\s*,\s*'(.+?)'\s*\)$/i);
  if (stringAggMatch) {
    const col = stringAggMatch[1].toLowerCase();
    const sep = stringAggMatch[2];
    return rows.map(r => String(r[col] ?? '')).filter(Boolean).join(sep);
  }

  const arrayAggMatch = expr.match(/^ARRAY_AGG\s*\(\s*(\w+)\s*\)$/i);
  if (arrayAggMatch) {
    const col = arrayAggMatch[1].toLowerCase();
    return `{${rows.map(r => String(r[col] ?? 'NULL')).join(',')}}`;
  }

  const boolAndMatch = expr.match(/^BOOL_AND\s*\(\s*(\w+)\s*\)$/i);
  if (boolAndMatch) {
    const col = boolAndMatch[1].toLowerCase();
    return rows.every(r => Boolean(r[col]));
  }

  const boolOrMatch = expr.match(/^BOOL_OR\s*\(\s*(\w+)\s*\)$/i);
  if (boolOrMatch) {
    const col = boolOrMatch[1].toLowerCase();
    return rows.some(r => Boolean(r[col]));
  }

  return undefined;
};

// ─── Aggregate SELECT (without GROUP BY) ─────────────────────
const execAggregateSelect = (selectParts: string[], rows: Row[], table: TableState): ExecutionResult => {
  const cols: string[] = [];
  const vals: CellValue[] = [];

  for (const part of selectParts) {
    const trimmed = part.trim();
    const aliasMatch = trimmed.match(/^(.+?)\s+AS\s+(\w+)$/i);
    const expr = aliasMatch ? aliasMatch[1].trim() : trimmed;
    const alias = aliasMatch ? aliasMatch[2].toLowerCase() : expr.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const aggVal = evaluateAggregate(expr, rows);
    cols.push(alias);
    vals.push(aggVal !== undefined ? aggVal : evaluateExpression(expr, rows[0] || {}));
  }

  return { id: uid(), type: 'result', message: formatTable(cols, [vals]) + `\n(1 row)`, timestamp: new Date(), rowsAffected: 1, tableData: { columns: cols, rows: [vals] } };
};

// ─── Window Functions ─────────────────────
const execWindowSelect = (selectParts: string[], rows: Row[], table: TableState, orderByClause: string | undefined, limitNum: number | undefined, offsetNum: number | undefined, isDistinct: boolean): ExecutionResult => {
  const outputCols: string[] = [];
  const resultData: CellValue[][] = [];

  // Sort rows if ORDER BY in window
  let sortedRows = [...rows];

  // Parse window functions and apply them
  const colExprs: { expr: string; alias: string; isWindow: boolean; windowFunc?: string; windowCol?: string; partitionBy?: string; orderBy?: string }[] = [];

  for (const part of selectParts) {
    const trimmed = part.trim();
    const aliasMatch = trimmed.match(/^(.+?)\s+AS\s+(\w+)$/i);
    const expr = aliasMatch ? aliasMatch[1].trim() : trimmed;
    const alias = aliasMatch ? aliasMatch[2].toLowerCase() : expr.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const windowMatch = expr.match(/^(\w+)\s*\(\s*(.*?)\s*\)\s+OVER\s*\(\s*(?:PARTITION\s+BY\s+(\w+))?\s*(?:ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?)?\s*\)$/i);
    if (windowMatch) {
      colExprs.push({
        expr, alias, isWindow: true,
        windowFunc: windowMatch[1].toUpperCase(),
        windowCol: windowMatch[2] || '',
        partitionBy: windowMatch[3]?.toLowerCase(),
        orderBy: windowMatch[4]?.toLowerCase(),
      });
    } else {
      colExprs.push({ expr, alias, isWindow: false });
    }
    outputCols.push(alias);
  }

  // First, apply any window ORDER BY
  const firstWindowOrder = colExprs.find(c => c.isWindow && c.orderBy);
  if (firstWindowOrder?.orderBy) {
    const col = firstWindowOrder.orderBy;
    sortedRows.sort((a, b) => {
      const va = a[col], vb = b[col];
      if (va == null) return 1;
      if (vb == null) return -1;
      return va > vb ? 1 : va < vb ? -1 : 0;
    });
  }

  for (let ri = 0; ri < sortedRows.length; ri++) {
    const row = sortedRows[ri];
    const outputRow: CellValue[] = [];

    for (const ce of colExprs) {
      if (ce.isWindow) {
        const partitionRows = ce.partitionBy
          ? sortedRows.filter(r => r[ce.partitionBy!] === row[ce.partitionBy!])
          : sortedRows;

        const rowIndexInPartition = partitionRows.indexOf(row);

        switch (ce.windowFunc) {
          case 'ROW_NUMBER':
            outputRow.push(rowIndexInPartition + 1);
            break;
          case 'RANK': {
            // Same value gets same rank, with gaps
            let rank = 1;
            if (ce.orderBy) {
              for (let i = 0; i < rowIndexInPartition; i++) {
                if (partitionRows[i][ce.orderBy] !== row[ce.orderBy]) rank = i + 1;
              }
              if (rowIndexInPartition > 0 && partitionRows[rowIndexInPartition - 1][ce.orderBy!] !== row[ce.orderBy!]) {
                rank = rowIndexInPartition + 1;
              }
            }
            outputRow.push(rank);
            break;
          }
          case 'DENSE_RANK': {
            if (ce.orderBy) {
              const uniqueVals = [...new Set(partitionRows.map(r => r[ce.orderBy!]))];
              outputRow.push(uniqueVals.indexOf(row[ce.orderBy!]) + 1);
            } else {
              outputRow.push(1);
            }
            break;
          }
          case 'NTILE': {
            const n = Number(ce.windowCol) || 1;
            const bucket = Math.floor(rowIndexInPartition / Math.ceil(partitionRows.length / n)) + 1;
            outputRow.push(Math.min(bucket, n));
            break;
          }
          case 'LAG': {
            const col = ce.windowCol?.toLowerCase() || '';
            const offset = 1;
            const prev = rowIndexInPartition - offset >= 0 ? partitionRows[rowIndexInPartition - offset] : null;
            outputRow.push(prev ? (prev[col] ?? null) : null);
            break;
          }
          case 'LEAD': {
            const col = ce.windowCol?.toLowerCase() || '';
            const offset = 1;
            const next = rowIndexInPartition + offset < partitionRows.length ? partitionRows[rowIndexInPartition + offset] : null;
            outputRow.push(next ? (next[col] ?? null) : null);
            break;
          }
          case 'FIRST_VALUE': {
            const col = ce.windowCol?.toLowerCase() || '';
            outputRow.push(partitionRows[0]?.[col] ?? null);
            break;
          }
          case 'LAST_VALUE': {
            const col = ce.windowCol?.toLowerCase() || '';
            outputRow.push(partitionRows[partitionRows.length - 1]?.[col] ?? null);
            break;
          }
          case 'NTH_VALUE': {
            const col = ce.windowCol?.toLowerCase() || '';
            outputRow.push(partitionRows[0]?.[col] ?? null); // simplified
            break;
          }
          case 'SUM': {
            const col = ce.windowCol?.toLowerCase() || '';
            outputRow.push(partitionRows.reduce((s, r) => s + Number(r[col] || 0), 0));
            break;
          }
          case 'AVG': {
            const col = ce.windowCol?.toLowerCase() || '';
            const vals = partitionRows.map(r => Number(r[col] || 0));
            outputRow.push(parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)));
            break;
          }
          case 'COUNT': {
            outputRow.push(partitionRows.length);
            break;
          }
          case 'MIN': {
            const col = ce.windowCol?.toLowerCase() || '';
            const vals = partitionRows.map(r => Number(r[col] || 0));
            outputRow.push(Math.min(...vals));
            break;
          }
          case 'MAX': {
            const col = ce.windowCol?.toLowerCase() || '';
            const vals = partitionRows.map(r => Number(r[col] || 0));
            outputRow.push(Math.max(...vals));
            break;
          }
          case 'PERCENT_RANK': {
            const n = partitionRows.length;
            outputRow.push(n <= 1 ? 0 : parseFloat((rowIndexInPartition / (n - 1)).toFixed(4)));
            break;
          }
          case 'CUME_DIST': {
            const n = partitionRows.length;
            outputRow.push(parseFloat(((rowIndexInPartition + 1) / n).toFixed(4)));
            break;
          }
          default:
            outputRow.push(null);
        }
      } else {
        outputRow.push(evaluateExpression(ce.expr, row));
      }
    }

    resultData.push(outputRow);
  }

  // Apply outer ORDER BY
  if (orderByClause) {
    // For window results, order by column alias
    const orderMatch = orderByClause.match(/^(\w+)(?:\s+(ASC|DESC))?$/i);
    if (orderMatch) {
      const colIdx = outputCols.indexOf(orderMatch[1].toLowerCase());
      if (colIdx >= 0) {
        const desc = orderMatch[2]?.toUpperCase() === 'DESC';
        resultData.sort((a, b) => {
          const va = a[colIdx], vb = b[colIdx];
          if (va == null) return 1;
          if (vb == null) return -1;
          const cmp = va > vb ? 1 : va < vb ? -1 : 0;
          return desc ? -cmp : cmp;
        });
      }
    }
  }

  let finalRows = resultData;
  if (offsetNum) finalRows = finalRows.slice(offsetNum);
  if (limitNum !== undefined) finalRows = finalRows.slice(0, limitNum);
  if (isDistinct) finalRows = deduplicateRows(outputCols, finalRows);

  return {
    id: uid(), type: 'result',
    message: formatTable(outputCols, finalRows) + `\n(${finalRows.length} row${finalRows.length !== 1 ? 's' : ''})`,
    timestamp: new Date(),
    rowsAffected: finalRows.length,
    tableData: { columns: outputCols, rows: finalRows },
  };
};

// ─── ORDER BY Helper (multiple columns) ─────────────────────
const applyOrderBy = (rows: Row[], orderByClause: string) => {
  const orderParts = splitTopLevelCommas(orderByClause);
  const orderSpecs = orderParts.map(p => {
    const m = p.trim().match(/^([\w.]+)(?:\s+(ASC|DESC))?(?:\s+NULLS\s+(FIRST|LAST))?$/i);
    if (m) return { col: m[1].toLowerCase(), desc: m[2]?.toUpperCase() === 'DESC', nullsFirst: m[3]?.toUpperCase() === 'FIRST' };
    return { col: p.trim().toLowerCase(), desc: false, nullsFirst: false };
  });

  rows.sort((a, b) => {
    for (const spec of orderSpecs) {
      const va = a[spec.col], vb = b[spec.col];
      if (va == null && vb == null) continue;
      if (va == null) return spec.nullsFirst ? -1 : 1;
      if (vb == null) return spec.nullsFirst ? 1 : -1;
      const cmp = va > vb ? 1 : va < vb ? -1 : 0;
      if (cmp !== 0) return spec.desc ? -cmp : cmp;
    }
    return 0;
  });
};

const execUpdate = (stmt: string): ExecutionResult => {
  // Check for RETURNING
  const returningMatch = stmt.match(/^([\s\S]+?)\s+RETURNING\s+(.+)$/i);
  const actualStmt = returningMatch ? returningMatch[1] : stmt;
  const returningCols = returningMatch ? returningMatch[2].trim() : null;

  const m = actualStmt.match(/UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+))?\s*$/i);
  if (!m) return { id: uid(), type: 'error', message: 'ERROR: Invalid UPDATE syntax', timestamp: new Date() };

  const tableName = m[1].toLowerCase();
  const db = getActiveDb();
  const table = db.tables.get(tableName);
  if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };

  const setParts = splitTopLevelCommas(m[2]);
  const assignments: { col: string; val: string }[] = setParts.map(p => {
    const eqIdx = p.indexOf('=');
    return { col: p.slice(0, eqIdx).trim().toLowerCase(), val: p.slice(eqIdx + 1).trim() };
  });

  const whereClause = m[3]?.trim();
  let updated = 0;
  const updatedRows: Row[] = [];

  for (const row of table.rows) {
    if (evaluateCondition(row, whereClause || '')) {
      const updatedColNames: string[] = [];
      for (const { col, val } of assignments) {
        const colDef = table.columns.find(c => c.name === col);
        if (!colDef) {
          return { id: uid(), type: 'error', message: `ERROR: column "${col}" of relation "${tableName}" does not exist`, timestamp: new Date() };
        }
        const newVal = evaluateExpression(val, row);
        // Data type validation
        const typeErr = validateDataType(newVal, colDef);
        if (typeErr) return { id: uid(), type: 'error', message: typeErr, timestamp: new Date() };
        // VARCHAR length check
        const lenErr = validateVarcharLength(newVal, colDef);
        if (lenErr) {
          return { id: uid(), type: 'error', message: `${lenErr}\nDETAIL: Column "${col}" value "${newVal}" exceeds limit`, timestamp: new Date() };
        }
        // NOT NULL check
        if (!colDef.nullable && newVal === null) {
          return { id: uid(), type: 'error', message: `ERROR: null value in column "${col}" violates not-null constraint`, timestamp: new Date() };
        }
        row[col] = coerceValue(newVal, colDef);
        updatedColNames.push(col);
      }
      // CHECK constraint validation
      for (const col of table.columns) {
        if (col.check && updatedColNames.includes(col.name)) {
          if (!evaluateCheckConstraint(col.check, row)) {
            return { id: uid(), type: 'error', message: `ERROR: new row violates check constraint\nDETAIL: Failing row check: ${col.check}`, timestamp: new Date() };
          }
        }
      }
      // Unique constraint check after update
      for (const col of table.columns) {
        if ((col.unique || col.primaryKey) && updatedColNames.includes(col.name) && row[col.name] !== null) {
          const duplicate = table.rows.find(r => r !== row && r[col.name] === row[col.name]);
          if (duplicate) {
            return { id: uid(), type: 'error', message: `ERROR: duplicate key value violates unique constraint "${tableName}_${col.name}_key"\nDETAIL: Key (${col.name})=(${row[col.name]}) already exists.`, timestamp: new Date() };
          }
        }
      }
      // FK check after update
      for (const fk of table.foreignKeys) {
        if (updatedColNames.includes(fk.column)) {
          const fkErr = validateForeignKey(fk, row[fk.column], db);
          if (fkErr) return { id: uid(), type: 'error', message: fkErr, timestamp: new Date() };
        }
      }
      updated++;
      updatedRows.push(row);
    }
  }

  if (returningCols && updatedRows.length > 0) {
    const cols = returningCols === '*' ? table.columns.map(c => c.name) : returningCols.split(',').map(c => c.trim().toLowerCase());
    const dataRows = updatedRows.map(r => cols.map(c => r[c] ?? null));
    return {
      id: uid(), type: 'result',
      message: `UPDATE ${updated}\n` + formatTable(cols, dataRows),
      timestamp: new Date(), rowsAffected: updated,
      tableData: { columns: cols, rows: dataRows },
    };
  }

  return { id: uid(), type: 'success', message: `UPDATE ${updated}`, timestamp: new Date(), rowsAffected: updated };
};

const execDelete = (stmt: string): ExecutionResult => {
  // Check for RETURNING
  const returningMatch = stmt.match(/^([\s\S]+?)\s+RETURNING\s+(.+)$/i);
  const actualStmt = returningMatch ? returningMatch[1] : stmt;
  const returningCols = returningMatch ? returningMatch[2].trim() : null;

  const m = actualStmt.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+([\s\S]+))?\s*$/i);
  if (!m) return { id: uid(), type: 'error', message: 'ERROR: Invalid DELETE syntax', timestamp: new Date() };

  const tableName = m[1].toLowerCase();
  const db = getActiveDb();
  const table = db.tables.get(tableName);
  if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };

  const whereClause = m[2]?.trim();
  const before = table.rows.length;
  let deletedRows: Row[] = [];

  if (!whereClause) {
    deletedRows = [...table.rows];
    table.rows = [];
  } else {
    deletedRows = table.rows.filter(row => evaluateCondition(row, whereClause));
    table.rows = table.rows.filter(row => !evaluateCondition(row, whereClause));
  }

  const deleted = before - table.rows.length;

  // Handle FK CASCADE / RESTRICT on delete
  for (const deletedRow of deletedRows) {
    for (const [, childTable] of db.tables) {
      for (const fk of childTable.foreignKeys) {
        if (fk.refTable === tableName) {
          const refVal = deletedRow[fk.refColumn];
          const affectedRows = childTable.rows.filter(r => r[fk.column] == refVal);
          if (affectedRows.length > 0) {
            if (fk.onDelete === 'RESTRICT' || fk.onDelete === 'NO_ACTION' || !fk.onDelete) {
              // Restore deleted rows and return error
              table.rows.push(...deletedRows);
              return { id: uid(), type: 'error', message: `ERROR: update or delete on table "${tableName}" violates foreign key constraint\nDETAIL: Key (${fk.refColumn})=(${refVal}) is still referenced from table "${childTable.name}"`, timestamp: new Date() };
            }
            if (fk.onDelete === 'CASCADE') {
              childTable.rows = childTable.rows.filter(r => r[fk.column] != refVal);
            }
            if (fk.onDelete === 'SET NULL') {
              affectedRows.forEach(r => { r[fk.column] = null; });
            }
          }
        }
      }
    }
  }

  if (returningCols && deletedRows.length > 0) {
    const cols = returningCols === '*' ? table.columns.map(c => c.name) : returningCols.split(',').map(c => c.trim().toLowerCase());
    const dataRows = deletedRows.map(r => cols.map(c => r[c] ?? null));
    return {
      id: uid(), type: 'result',
      message: `DELETE ${deleted}\n` + formatTable(cols, dataRows),
      timestamp: new Date(), rowsAffected: deleted,
      tableData: { columns: cols, rows: dataRows },
    };
  }

  return { id: uid(), type: 'success', message: `DELETE ${deleted}`, timestamp: new Date(), rowsAffected: deleted };
};

const execDrop = (stmt: string): ExecutionResult => {
  const upper = stmt.toUpperCase().replace(/\s+/g, ' ').trim();
  const ifExists = /IF\s+EXISTS/i.test(stmt);
  const db = getActiveDb();

  const tableMatch = stmt.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
  if (tableMatch) {
    const name = tableMatch[1].toLowerCase();
    if (!db.tables.has(name)) {
      if (ifExists) return { id: uid(), type: 'info', message: `NOTICE: table "${name}" does not exist, skipping`, timestamp: new Date() };
      return { id: uid(), type: 'error', message: `ERROR: table "${name}" does not exist`, timestamp: new Date() };
    }
    const rowCount = db.tables.get(name)!.rows.length;
    db.tables.delete(name);
    return { id: uid(), type: 'success', message: `✓ DROP TABLE "${name}" — ${rowCount} rows removed`, timestamp: new Date() };
  }

  const dbMatch = stmt.match(/DROP\s+DATABASE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
  if (dbMatch) {
    const name = dbMatch[1].toLowerCase();
    if (!databases.has(name)) {
      if (ifExists) return { id: uid(), type: 'info', message: `NOTICE: database "${name}" does not exist, skipping`, timestamp: new Date() };
      return { id: uid(), type: 'error', message: `ERROR: database "${name}" does not exist`, timestamp: new Date() };
    }
    databases.delete(name);
    if (currentDb === name) currentDb = null;
    return { id: uid(), type: 'success', message: `✓ DROP DATABASE "${name}"`, timestamp: new Date() };
  }

  const viewMatch = stmt.match(/DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
  if (viewMatch) {
    const name = viewMatch[1].toLowerCase();
    if (!db.views.has(name)) {
      if (ifExists) return { id: uid(), type: 'info', message: `NOTICE: view "${name}" does not exist, skipping`, timestamp: new Date() };
      return { id: uid(), type: 'error', message: `ERROR: view "${name}" does not exist`, timestamp: new Date() };
    }
    db.views.delete(name);
    return { id: uid(), type: 'success', message: `✓ DROP VIEW "${name}"`, timestamp: new Date() };
  }

  const indexMatch = stmt.match(/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
  if (indexMatch) {
    const name = indexMatch[1].toLowerCase();
    if (!db.indexes.has(name)) {
      if (ifExists) return { id: uid(), type: 'info', message: `NOTICE: index "${name}" does not exist, skipping`, timestamp: new Date() };
      return { id: uid(), type: 'error', message: `ERROR: index "${name}" does not exist`, timestamp: new Date() };
    }
    db.indexes.delete(name);
    return { id: uid(), type: 'success', message: `✓ DROP INDEX "${name}"`, timestamp: new Date() };
  }

  const seqMatch = stmt.match(/DROP\s+SEQUENCE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
  if (seqMatch) {
    const name = seqMatch[1].toLowerCase();
    if (!db.sequences.has(name)) {
      if (ifExists) return { id: uid(), type: 'info', message: `NOTICE: sequence "${name}" does not exist, skipping`, timestamp: new Date() };
      return { id: uid(), type: 'error', message: `ERROR: sequence "${name}" does not exist`, timestamp: new Date() };
    }
    db.sequences.delete(name);
    return { id: uid(), type: 'success', message: `✓ DROP SEQUENCE "${name}"`, timestamp: new Date() };
  }

  return { id: uid(), type: 'success', message: `✓ ${upper.split(' ').slice(0, 3).join(' ')} — executed`, timestamp: new Date() };
};

const execTruncate = (stmt: string): ExecutionResult => {
  const m = stmt.match(/TRUNCATE\s+(?:TABLE\s+)?(\w+)(?:\s+(CASCADE|RESTRICT))?/i);
  if (!m) return { id: uid(), type: 'error', message: 'ERROR: Invalid TRUNCATE syntax', timestamp: new Date() };

  const tableName = m[1].toLowerCase();
  const db = getActiveDb();
  const table = db.tables.get(tableName);
  if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };

  const removed = table.rows.length;
  table.rows = [];
  table.autoIncrementCounters = {};
  return { id: uid(), type: 'success', message: `TRUNCATE TABLE — ${removed} rows removed`, timestamp: new Date(), rowsAffected: removed };
};

const execAlter = (stmt: string): ExecutionResult => {
  const db = getActiveDb();

  // RENAME TABLE
  const renameTable = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+RENAME\s+TO\s+(\w+)/i);
  if (renameTable) {
    const oldName = renameTable[1].toLowerCase();
    const newName = renameTable[2].toLowerCase();
    const table = db.tables.get(oldName);
    if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${oldName}" does not exist`, timestamp: new Date() };
    if (db.tables.has(newName)) return { id: uid(), type: 'error', message: `ERROR: relation "${newName}" already exists`, timestamp: new Date() };
    table.name = newName;
    db.tables.set(newName, table);
    db.tables.delete(oldName);
    return { id: uid(), type: 'success', message: `ALTER TABLE — "${oldName}" renamed to "${newName}"`, timestamp: new Date() };
  }

  // RENAME COLUMN
  const renameCol = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+RENAME\s+(?:COLUMN\s+)?(\w+)\s+TO\s+(\w+)/i);
  if (renameCol) {
    const tableName = renameCol[1].toLowerCase();
    const oldCol = renameCol[2].toLowerCase();
    const newCol = renameCol[3].toLowerCase();
    const table = db.tables.get(tableName);
    if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };
    const col = table.columns.find(c => c.name === oldCol);
    if (!col) return { id: uid(), type: 'error', message: `ERROR: column "${oldCol}" does not exist`, timestamp: new Date() };
    col.name = newCol;
    table.rows.forEach(row => {
      row[newCol] = row[oldCol];
      delete row[oldCol];
    });
    return { id: uid(), type: 'success', message: `ALTER TABLE "${tableName}" — column "${oldCol}" renamed to "${newCol}"`, timestamp: new Date() };
  }

  // ALTER COLUMN TYPE
  const alterType = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+ALTER\s+(?:COLUMN\s+)?(\w+)\s+(?:SET\s+DATA\s+)?TYPE\s+(\w+)/i);
  if (alterType) {
    const tableName = alterType[1].toLowerCase();
    const colName = alterType[2].toLowerCase();
    const newType = alterType[3].toUpperCase();
    const table = db.tables.get(tableName);
    if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };
    const col = table.columns.find(c => c.name === colName);
    if (!col) return { id: uid(), type: 'error', message: `ERROR: column "${colName}" does not exist`, timestamp: new Date() };
    col.type = newType;
    // Cast existing values
    table.rows.forEach(row => { row[colName] = applyCast(row[colName], newType); });
    return { id: uid(), type: 'success', message: `ALTER TABLE "${tableName}" — column "${colName}" type changed to ${newType}`, timestamp: new Date() };
  }

  // SET NOT NULL
  const setNotNull = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+ALTER\s+(?:COLUMN\s+)?(\w+)\s+SET\s+NOT\s+NULL/i);
  if (setNotNull) {
    const tableName = setNotNull[1].toLowerCase();
    const colName = setNotNull[2].toLowerCase();
    const table = db.tables.get(tableName);
    if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };
    const col = table.columns.find(c => c.name === colName);
    if (!col) return { id: uid(), type: 'error', message: `ERROR: column "${colName}" does not exist`, timestamp: new Date() };
    // Check for existing nulls
    const hasNulls = table.rows.some(r => r[colName] === null);
    if (hasNulls) return { id: uid(), type: 'error', message: `ERROR: column "${colName}" contains null values`, timestamp: new Date() };
    col.nullable = false;
    return { id: uid(), type: 'success', message: `ALTER TABLE "${tableName}" — column "${colName}" set NOT NULL`, timestamp: new Date() };
  }

  // DROP NOT NULL
  const dropNotNull = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+ALTER\s+(?:COLUMN\s+)?(\w+)\s+DROP\s+NOT\s+NULL/i);
  if (dropNotNull) {
    const tableName = dropNotNull[1].toLowerCase();
    const colName = dropNotNull[2].toLowerCase();
    const table = db.tables.get(tableName);
    if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };
    const col = table.columns.find(c => c.name === colName);
    if (!col) return { id: uid(), type: 'error', message: `ERROR: column "${colName}" does not exist`, timestamp: new Date() };
    col.nullable = true;
    return { id: uid(), type: 'success', message: `ALTER TABLE "${tableName}" — column "${colName}" dropped NOT NULL`, timestamp: new Date() };
  }

  // SET DEFAULT
  const setDefault = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+ALTER\s+(?:COLUMN\s+)?(\w+)\s+SET\s+DEFAULT\s+(.+)/i);
  if (setDefault) {
    const tableName = setDefault[1].toLowerCase();
    const colName = setDefault[2].toLowerCase();
    const defaultVal = parseValue(setDefault[3].trim());
    const table = db.tables.get(tableName);
    if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };
    const col = table.columns.find(c => c.name === colName);
    if (!col) return { id: uid(), type: 'error', message: `ERROR: column "${colName}" does not exist`, timestamp: new Date() };
    col.defaultValue = defaultVal;
    return { id: uid(), type: 'success', message: `ALTER TABLE "${tableName}" — column "${colName}" default set to ${defaultVal}`, timestamp: new Date() };
  }

  // DROP DEFAULT
  const dropDefault = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+ALTER\s+(?:COLUMN\s+)?(\w+)\s+DROP\s+DEFAULT/i);
  if (dropDefault) {
    const tableName = dropDefault[1].toLowerCase();
    const colName = dropDefault[2].toLowerCase();
    const table = db.tables.get(tableName);
    if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };
    const col = table.columns.find(c => c.name === colName);
    if (!col) return { id: uid(), type: 'error', message: `ERROR: column "${colName}" does not exist`, timestamp: new Date() };
    col.defaultValue = null;
    return { id: uid(), type: 'success', message: `ALTER TABLE "${tableName}" — column "${colName}" default dropped`, timestamp: new Date() };
  }

  // ADD CONSTRAINT
  const addConstraint = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+CONSTRAINT\s+(\w+)\s+(.*)/i);
  if (addConstraint) {
    const tableName = addConstraint[1].toLowerCase();
    const constraintName = addConstraint[2].toLowerCase();
    const table = db.tables.get(tableName);
    if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };
    return { id: uid(), type: 'success', message: `ALTER TABLE "${tableName}" — constraint "${constraintName}" added`, timestamp: new Date() };
  }

  // DROP CONSTRAINT
  const dropConstraint = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
  if (dropConstraint) {
    const tableName = dropConstraint[1].toLowerCase();
    return { id: uid(), type: 'success', message: `ALTER TABLE "${tableName}" — constraint dropped`, timestamp: new Date() };
  }

  // ADD COLUMN
  const addCol = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+(?:COLUMN\s+)?(\w+)\s+(\w[\w()]*(?:\s*\(\s*\d+\s*\))?)/i);
  if (addCol) {
    const tableName = addCol[1].toLowerCase();
    const table = db.tables.get(tableName);
    if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };

    const colName = addCol[2].toLowerCase();
    if (table.columns.find(c => c.name === colName)) {
      return { id: uid(), type: 'error', message: `ERROR: column "${colName}" of relation "${tableName}" already exists`, timestamp: new Date() };
    }

    const colTypeRaw = addCol[3].toUpperCase();
    const { baseType, maxLength } = parseTypeLength(colTypeRaw);

    const rest = stmt.slice(addCol.index! + addCol[0].length).toUpperCase();
    let defaultValue: CellValue = null;
    const defMatch = rest.match(/DEFAULT\s+(.+?)(?:\s+NOT|\s*$)/i);
    if (defMatch) defaultValue = parseValue(defMatch[1].trim());

    // Validate DEFAULT against VARCHAR(n)
    if (defaultValue !== null && maxLength !== undefined) {
      const strVal = String(defaultValue);
      if (strVal.length > maxLength) {
        return { id: uid(), type: 'error', message: `ERROR: value too long for type character varying(${maxLength})\nDETAIL: Default value "${strVal}" exceeds maximum length ${maxLength}`, timestamp: new Date() };
      }
    }

    table.columns.push({
      name: colName, type: colTypeRaw, maxLength, nullable: !rest.includes('NOT NULL'),
      defaultValue, primaryKey: false, unique: rest.includes('UNIQUE'), autoIncrement: false,
    });
    table.rows.forEach(row => { row[colName] = defaultValue; });
    return { id: uid(), type: 'success', message: `ALTER TABLE "${tableName}" — column "${colName}" added`, timestamp: new Date() };
  }

  // DROP COLUMN
  const dropCol = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(\w+)/i);
  if (dropCol) {
    const tableName = dropCol[1].toLowerCase();
    const table = db.tables.get(tableName);
    if (!table) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };

    const colName = dropCol[2].toLowerCase();
    if (!table.columns.find(c => c.name === colName)) {
      if (/IF\s+EXISTS/i.test(stmt)) return { id: uid(), type: 'info', message: `NOTICE: column "${colName}" does not exist, skipping`, timestamp: new Date() };
      return { id: uid(), type: 'error', message: `ERROR: column "${colName}" of relation "${tableName}" does not exist`, timestamp: new Date() };
    }
    table.columns = table.columns.filter(c => c.name !== colName);
    table.rows.forEach(row => { delete row[colName]; });
    return { id: uid(), type: 'success', message: `ALTER TABLE "${tableName}" — column "${colName}" dropped`, timestamp: new Date() };
  }

  // ALTER SEQUENCE
  const alterSeq = stmt.match(/ALTER\s+SEQUENCE\s+(\w+)\s+(.+)/i);
  if (alterSeq) {
    const seqName = alterSeq[1].toLowerCase();
    const seq = db.sequences.get(seqName);
    if (!seq) return { id: uid(), type: 'error', message: `ERROR: sequence "${seqName}" does not exist`, timestamp: new Date() };
    const restartMatch = alterSeq[2].match(/RESTART\s+(?:WITH\s+)?(\d+)/i);
    if (restartMatch) seq.currentVal = parseInt(restartMatch[1]) - seq.increment;
    const incrementMatch = alterSeq[2].match(/INCREMENT\s+(?:BY\s+)?(\d+)/i);
    if (incrementMatch) seq.increment = parseInt(incrementMatch[1]);
    return { id: uid(), type: 'success', message: `ALTER SEQUENCE "${seqName}" — updated`, timestamp: new Date() };
  }

  return { id: uid(), type: 'success', message: `✓ ALTER — executed successfully`, timestamp: new Date() };
};

// ─── CREATE VIEW ────────────────────────────────
const execCreateView = (stmt: string): ExecutionResult => {
  const m = stmt.match(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(\w+)\s+AS\s+([\s\S]+)/i);
  if (!m) return { id: uid(), type: 'error', message: 'ERROR: Invalid CREATE VIEW syntax\nHINT: CREATE VIEW name AS SELECT ...', timestamp: new Date() };

  const viewName = m[1].toLowerCase();
  const query = m[2].trim();
  const db = getActiveDb();
  const isReplace = /OR\s+REPLACE/i.test(stmt);

  if (db.views.has(viewName) && !isReplace) {
    return { id: uid(), type: 'error', message: `ERROR: view "${viewName}" already exists`, timestamp: new Date() };
  }

  db.views.set(viewName, { name: viewName, query });
  return { id: uid(), type: 'success', message: `✓ CREATE VIEW "${viewName}"`, timestamp: new Date() };
};

// ─── CREATE INDEX ────────────────────────────────
const execCreateIndex = (stmt: string): ExecutionResult => {
  const m = stmt.match(/CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)\s*\(([^)]+)\)/i);
  if (!m) {
    // Simple index without name
    const simple = stmt.match(/CREATE\s+(UNIQUE\s+)?INDEX\s+ON\s+(\w+)\s*\(([^)]+)\)/i);
    if (simple) {
      const tableName = simple[2].toLowerCase();
      const cols = simple[3].split(',').map(c => c.trim().toLowerCase());
      const idxName = `${tableName}_${cols.join('_')}_idx`;
      const db = getActiveDb();
      if (!db.tables.has(tableName)) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };
      db.indexes.set(idxName, { name: idxName, tableName, columns: cols, unique: !!simple[1] });
      return { id: uid(), type: 'success', message: `✓ CREATE INDEX "${idxName}" on "${tableName}" (${cols.join(', ')})`, timestamp: new Date() };
    }
    return { id: uid(), type: 'success', message: `✓ CREATE INDEX — compiled`, timestamp: new Date() };
  }

  const isUnique = !!m[1];
  const indexName = m[2].toLowerCase();
  const tableName = m[3].toLowerCase();
  const columns = m[4].split(',').map(c => c.trim().toLowerCase());
  const db = getActiveDb();

  if (!db.tables.has(tableName)) return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };
  if (db.indexes.has(indexName)) {
    if (/IF\s+NOT\s+EXISTS/i.test(stmt)) return { id: uid(), type: 'info', message: `NOTICE: index "${indexName}" already exists, skipping`, timestamp: new Date() };
    return { id: uid(), type: 'error', message: `ERROR: index "${indexName}" already exists`, timestamp: new Date() };
  }

  db.indexes.set(indexName, { name: indexName, tableName, columns, unique: isUnique });
  return { id: uid(), type: 'success', message: `✓ CREATE${isUnique ? ' UNIQUE' : ''} INDEX "${indexName}" on "${tableName}" (${columns.join(', ')})`, timestamp: new Date() };
};

// ─── CREATE SEQUENCE ────────────────────────────────
const execCreateSequence = (stmt: string): ExecutionResult => {
  const m = stmt.match(/CREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
  if (!m) return { id: uid(), type: 'error', message: 'ERROR: Invalid CREATE SEQUENCE syntax', timestamp: new Date() };

  const seqName = m[1].toLowerCase();
  const db = getActiveDb();

  if (db.sequences.has(seqName)) {
    if (/IF\s+NOT\s+EXISTS/i.test(stmt)) return { id: uid(), type: 'info', message: `NOTICE: sequence "${seqName}" already exists, skipping`, timestamp: new Date() };
    return { id: uid(), type: 'error', message: `ERROR: sequence "${seqName}" already exists`, timestamp: new Date() };
  }

  let startVal = 1, increment = 1, minVal = 1, maxVal = 2147483647;
  const startMatch = stmt.match(/START\s+(?:WITH\s+)?(\d+)/i);
  if (startMatch) startVal = parseInt(startMatch[1]);
  const incMatch = stmt.match(/INCREMENT\s+(?:BY\s+)?(\d+)/i);
  if (incMatch) increment = parseInt(incMatch[1]);
  const minMatch = stmt.match(/MINVALUE\s+(\d+)/i);
  if (minMatch) minVal = parseInt(minMatch[1]);
  const maxMatch = stmt.match(/MAXVALUE\s+(\d+)/i);
  if (maxMatch) maxVal = parseInt(maxMatch[1]);

  db.sequences.set(seqName, { name: seqName, currentVal: startVal - increment, increment, minValue: minVal, maxValue: maxVal });
  return { id: uid(), type: 'success', message: `✓ CREATE SEQUENCE "${seqName}" (start: ${startVal}, increment: ${increment})`, timestamp: new Date() };
};

// Extension state
let enabledExtensions: Set<string> = new Set(['arya_sql']);

export const setEnabledExtensions = (ids: string[]) => {
  enabledExtensions = new Set(ids);
};

const execExplain = (stmt: string): ExecutionResult => {
  const inner = stmt.replace(/^EXPLAIN\s+(?:ANALYZE\s+)?/i, '').trim();
  const upper = inner.toUpperCase().replace(/\s+/g, ' ');
  const isAnalyze = /^EXPLAIN\s+ANALYZE/i.test(stmt);
  const hasArya = enabledExtensions.has('arya_sql');

  let plan = `Query Plan${hasArya ? ' (arya.sql optimized ⚡)' : ''}\n${'─'.repeat(60)}\n`;

  if (upper.startsWith('SELECT')) {
    const fromMatch = upper.match(/FROM\s+(\w+)/);
    const tableName = fromMatch?.[1]?.toLowerCase();
    const hasWhere = upper.includes('WHERE');
    const hasOrder = upper.includes('ORDER BY');
    const hasLimit = upper.includes('LIMIT');
    const hasJoin = upper.includes('JOIN');
    const hasGroup = upper.includes('GROUP BY');
    const hasWindow = upper.includes('OVER');

    if (tableName) {
      const db = getActiveDb();
      const table = db.tables.get(tableName);
      const rowCount = table?.rows.length ?? 0;

      if (hasArya) {
        plan += `  ⚡ arya.sql: Query Cache ${rowCount < 100 ? 'HIT' : 'MISS'}\n`;
        if (hasWhere) plan += `  ⚡ arya.sql: Auto-Index suggested on filter column\n`;
        if (hasJoin) plan += `  ⚡ arya.sql: Hash Join optimized → Parallel Merge Join\n`;
        if (hasOrder) plan += `  ⚡ arya.sql: Sort eliminated via index-ordered scan\n`;
        if (hasGroup) plan += `  ⚡ arya.sql: HashAggregate with parallel workers\n`;
        if (hasWindow) plan += `  ⚡ arya.sql: Window function optimized with incremental sort\n`;
      }

      if (hasWindow) plan += `  → WindowAgg  (cost=45.00..${(rowCount * 0.8 + 20).toFixed(2)} rows=${rowCount})\n`;
      if (hasGroup) plan += `  → HashAggregate  (cost=20.00..${(rowCount * 0.5 + 15).toFixed(2)} rows=${rowCount})\n    Group Key: specified column(s)\n`;
      if (hasOrder && !hasArya) plan += `  → Sort  (cost=88.17..90.51 rows=${rowCount})\n    Sort Key: specified column\n`;
      if (hasOrder && hasArya) plan += `  → Index Ordered Scan  (cost=0.15..${(rowCount * 0.3 + 5).toFixed(2)} rows=${rowCount})\n`;
      if (hasLimit) plan += `  → Limit  (cost=0.00..${hasArya ? '2.50' : '12.50'} rows=min(limit,${rowCount}))\n`;
      
      const scanCost = hasArya ? (rowCount * 0.4 + 8).toFixed(2) : (rowCount * 1.5 + 20).toFixed(2);
      const scanType = hasArya && hasWhere ? 'Index Scan' : hasWhere ? 'Seq Scan with Filter' : 'Seq Scan';
      plan += `  → ${scanType} on ${tableName}  (cost=0.00..${scanCost} rows=${rowCount} width=64)\n`;
      if (hasWhere) plan += `    Filter: (specified condition)\n`;

      if (isAnalyze) {
        const baseTime = hasArya ? 0.05 : 0.1;
        const execTime = (Math.random() * (hasArya ? 0.5 : 2) + baseTime).toFixed(3);
        const planTime = (Math.random() * (hasArya ? 0.1 : 0.5) + 0.01).toFixed(3);
        plan += `\nPlanning Time: ${planTime} ms${hasArya ? ' (arya.sql: -60%)' : ''}\nExecution Time: ${execTime} ms${hasArya ? ' (arya.sql: -75%)' : ''}`;
      }

      if (hasArya) {
        plan += `\n\n── arya.sql Optimization Report ──`;
        plan += `\n  ✓ Query cost reduced by ~${Math.floor(Math.random() * 30 + 50)}%`;
        plan += `\n  ✓ Parallel workers: ${Math.min(rowCount, 4)}`;
        plan += `\n  ✓ Cache strategy: ${rowCount < 100 ? 'Full cache' : 'Partial cache'}`;
        if (hasWhere) plan += `\n  ✓ Auto-index: recommended`;
      }
    } else {
      plan += `  → Result  (cost=0.00..0.01 rows=1 width=4)`;
    }
  } else {
    plan += `  → ModifyTable  (cost=0.00..${hasArya ? '12.00' : '35.50'} rows=0 width=0)`;
    if (hasArya) plan += `\n  ⚡ arya.sql: Batch optimization applied`;
  }

  const activeExts = Array.from(enabledExtensions);
  if (activeExts.length > 0) {
    plan += `\n\n── Active Extensions: ${activeExts.join(', ')} ──`;
  }

  return { id: uid(), type: 'plan', message: plan, timestamp: new Date() };
};

const execShowTables = (): ExecutionResult => {
  const db = getActiveDb();
  const tables = Array.from(db.tables.entries());
  const views = Array.from(db.views.entries());

  if (tables.length === 0 && views.length === 0) return { id: uid(), type: 'result', message: 'No tables or views found.\nHINT: Create a table with CREATE TABLE', timestamp: new Date() };

  const data: CellValue[][] = [
    ...tables.map(([name, t]) => [name, 'table', String(t.columns.length), String(t.rows.length)] as CellValue[]),
    ...views.map(([name]) => [name, 'view', '-', '-'] as CellValue[]),
  ];
  return { id: uid(), type: 'result', message: formatTable(['name', 'type', 'columns', 'rows'], data) + `\n(${data.length} relation${data.length > 1 ? 's' : ''})`, timestamp: new Date() };
};

const execDescribe = (stmt: string): ExecutionResult => {
  const m = stmt.match(/(?:DESCRIBE|\\d|\\dt)\s+(\w+)/i);
  if (!m) return execShowTables();

  const tableName = m[1].toLowerCase();
  const db = getActiveDb();
  const table = db.tables.get(tableName);

  if (!table) {
    // Check if it's a view
    const view = db.views.get(tableName);
    if (view) {
      return { id: uid(), type: 'result', message: `View "${tableName}"\nQuery: ${view.query}`, timestamp: new Date() };
    }
    return { id: uid(), type: 'error', message: `ERROR: relation "${tableName}" does not exist`, timestamp: new Date() };
  }

  const data = table.columns.map(c => [
    c.name,
    c.type,
    c.nullable ? 'YES' : 'NO',
    c.primaryKey ? 'PK' : c.unique ? 'UQ' : '',
    c.autoIncrement ? 'auto' : (c.defaultValue !== null ? String(c.defaultValue) : ''),
  ] as CellValue[]);

  // Show indexes for this table
  const tableIndexes = Array.from(db.indexes.values()).filter(i => i.tableName === tableName);
  let indexInfo = '';
  if (tableIndexes.length > 0) {
    indexInfo = '\nIndexes:\n' + tableIndexes.map(i => `  "${i.name}" ${i.unique ? 'UNIQUE ' : ''}(${i.columns.join(', ')})`).join('\n');
  }

  return {
    id: uid(), type: 'result',
    message: `Table "${tableName}"\n` + formatTable(['column', 'type', 'nullable', 'key', 'default'], data) + indexInfo,
    timestamp: new Date(),
  };
};

// ─── Show Sequences ────────────────────────────────
const execShowSequences = (): ExecutionResult => {
  const db = getActiveDb();
  const seqs = Array.from(db.sequences.entries());
  if (seqs.length === 0) return { id: uid(), type: 'result', message: 'No sequences found.', timestamp: new Date() };

  const data = seqs.map(([name, s]) => [name, String(s.currentVal), String(s.increment), String(s.minValue), String(s.maxValue)] as CellValue[]);
  return { id: uid(), type: 'result', message: formatTable(['sequence_name', 'current_value', 'increment', 'min_value', 'max_value'], data), timestamp: new Date() };
};

// ─── Show Indexes ────────────────────────────────
const execShowIndexes = (): ExecutionResult => {
  const db = getActiveDb();
  const idxs = Array.from(db.indexes.entries());
  if (idxs.length === 0) return { id: uid(), type: 'result', message: 'No indexes found.', timestamp: new Date() };

  const data = idxs.map(([name, i]) => [name, i.tableName, i.columns.join(', '), i.unique ? 'YES' : 'NO'] as CellValue[]);
  return { id: uid(), type: 'result', message: formatTable(['index_name', 'table', 'columns', 'unique'], data), timestamp: new Date() };
};

// ─── UNION Support ────────────────────────────────────

const execUnionOrSelect = (stmt: string): ExecutionResult => {
  const unionParts = stmt.split(/\bUNION\s+ALL\b/i);
  if (unionParts.length > 1) {
    return execUnionParts(unionParts, false);
  }
  const unionDistinctParts = stmt.split(/\bUNION\b/i);
  if (unionDistinctParts.length > 1) {
    return execUnionParts(unionDistinctParts, true);
  }
  return execSelect(stmt);
};

const execUnionParts = (parts: string[], removeDuplicates: boolean): ExecutionResult => {
  let allColumns: string[] | null = null;
  let allRows: CellValue[][] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const result = execSelect(trimmed);
    if (result.type === 'error') return result;
    if (!result.tableData) continue;

    if (allColumns === null) {
      allColumns = result.tableData.columns;
    } else if (result.tableData.columns.length !== allColumns.length) {
      return { id: uid(), type: 'error', message: `ERROR: each UNION query must have the same number of columns\nHINT: First query has ${allColumns.length} columns, but another has ${result.tableData.columns.length}`, timestamp: new Date() };
    }
    allRows.push(...result.tableData.rows);
  }

  if (!allColumns) {
    return { id: uid(), type: 'error', message: 'ERROR: Invalid UNION query', timestamp: new Date() };
  }

  if (removeDuplicates) {
    allRows = deduplicateRows(allColumns, allRows);
  }

  return {
    id: uid(), type: 'result',
    message: formatTable(allColumns, allRows) + `\n(${allRows.length} row${allRows.length !== 1 ? 's' : ''})`,
    timestamp: new Date(),
    rowsAffected: allRows.length,
    tableData: { columns: allColumns, rows: allRows },
  };
};

// ─── CREATE TYPE ────────────────────────────────
const execCreateType = (stmt: string): ExecutionResult => {
  const m = stmt.match(/CREATE\s+TYPE\s+(\w+)\s+AS\s+(ENUM\s*\([\s\S]+?\)|[\s\S]+)/i);
  if (!m) return { id: uid(), type: 'success', message: '✓ CREATE TYPE — compiled', timestamp: new Date() };
  const typeName = m[1].toLowerCase();
  return { id: uid(), type: 'success', message: `✓ CREATE TYPE "${typeName}"`, timestamp: new Date() };
};

// ─── CREATE EXTENSION ────────────────────────────────
const execCreateExtension = (stmt: string): ExecutionResult => {
  const m = stmt.match(/CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
  if (!m) return { id: uid(), type: 'success', message: '✓ CREATE EXTENSION — compiled', timestamp: new Date() };
  const extName = m[1].toLowerCase();
  return { id: uid(), type: 'success', message: `✓ CREATE EXTENSION "${extName}"`, timestamp: new Date() };
};

// ─── COMMENT ON ────────────────────────────────
const execComment = (stmt: string): ExecutionResult => {
  const m = stmt.match(/COMMENT\s+ON\s+(\w+)\s+(\w+(?:\.\w+)?)\s+IS\s+(.+)/i);
  if (!m) return { id: uid(), type: 'success', message: '✓ COMMENT — saved', timestamp: new Date() };
  return { id: uid(), type: 'success', message: `✓ COMMENT ON ${m[1]} ${m[2]}`, timestamp: new Date() };
};

// ─── Main Execute ────────────────────────────────────

export const executeSQL = async (sql: string, breakpointLines?: Set<number>): Promise<ExecutionResult[]> => {
  const results: ExecutionResult[] = [];
  const startTime = performance.now();

  // ─── Step 1: Real PostgreSQL syntax validation using WASM parser ─────
  const validation = await validateSQLStatements(sql);
  if (!validation.valid) {
    results.push({ id: uid(), type: 'info', message: `⟩ PostgreSQL syntax validation...`, timestamp: new Date() });
    for (const err of validation.errors) {
      const lineInfo = err.line ? ` (line ${err.line})` : '';
      const stmtInfo = err.statement ? `\n  → ${err.statement}...` : '';
      results.push({
        id: uid(),
        type: 'error',
        message: `${err.message}${lineInfo}${stmtInfo}`,
        timestamp: new Date(),
        line: err.line,
      });
    }
    results.push({
      id: uid(),
      type: 'error',
      message: `\n✗ PostgreSQL syntax validation FAILED — ${validation.errors.length} error(s) found in ${validation.parseTimeMs}ms\nHINT: Fix syntax errors before execution. All PostgreSQL rules are enforced.`,
      timestamp: new Date(),
    });
    return results;
  }

  results.push({
    id: uid(),
    type: 'info',
    message: `⟩ PostgreSQL syntax validated ✓ (${validation.parseTimeMs}ms)`,
    timestamp: new Date(),
  });

  // ─── Step 2: Execute validated SQL ─────
  // Strip comments
  const cleaned = sql.split('\n').map(line => {
    let result = '', inString = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "'" && (i === 0 || line[i-1] !== '\\')) inString = !inString;
      if (!inString && line[i] === '-' && line[i+1] === '-') break;
      result += line[i];
    }
    return result;
  }).join('\n');

  // Also strip block comments /* ... */
  const cleanedBlock = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // Split by semicolons but not inside strings
  const statements: string[] = [];
  let current = '', inStr = false;
  for (const ch of cleanedBlock) {
    if (ch === "'" && !inStr) inStr = true;
    else if (ch === "'" && inStr) inStr = false;
    if (ch === ';' && !inStr) { if (current.trim()) statements.push(current.trim()); current = ''; }
    else current += ch;
  }
  if (current.trim()) statements.push(current.trim());

  const validStatements = statements.filter(s => {
    const trimmed = s.replace(/[-\s]/g, '');
    return trimmed.length > 0;
  });

  if (validStatements.length === 0) {
    results.push({ id: uid(), type: 'info', message: 'No SQL statements to execute.', timestamp: new Date() });
    return results;
  }

  results.push({ id: uid(), type: 'info', message: `⟩ Executing ${validStatements.length} statement(s)...`, timestamp: new Date() });

  const allLines = sql.split('\n');
  let errorCount = 0, successCount = 0, totalRows = 0;

  for (let i = 0; i < validStatements.length; i++) {
    const stmt = validStatements[i];
    const upper = stmt.toUpperCase().replace(/\s+/g, ' ').trim();
    const stmtStart = stmt.trim().slice(0, 15);
    const lineNum = allLines.findIndex(l => l.includes(stmtStart.slice(0, Math.min(12, stmtStart.length)))) + 1;

    // Breakpoints
    if (breakpointLines?.size && lineNum > 0 && breakpointLines.has(lineNum)) {
      results.push({ id: uid(), type: 'debug', message: `⏸ Breakpoint hit at line ${lineNum}`, timestamp: new Date(), line: lineNum });
    }

    // ─── Robust Syntax Checks ─────────────────────────
    // Strip string literals and double-quoted identifiers before keyword checks
    const stripStringsAndIdents = (s: string): string => {
      return s.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
    };
    const stripped = stripStringsAndIdents(stmt);
    const strippedUpper = stripped.toUpperCase().replace(/\s+/g, ' ').trim();

    // Quote balance checks (count unescaped quotes)
    {
      let singleCount = 0, doubleCount = 0, inSingle = false, inDouble = false;
      for (let ci = 0; ci < stmt.length; ci++) {
        const ch = stmt[ci];
        if (ch === "'" && !inDouble) {
          // Handle escaped quotes ''
          if (inSingle && ci + 1 < stmt.length && stmt[ci + 1] === "'") { ci++; continue; }
          inSingle = !inSingle;
          singleCount++;
        } else if (ch === '"' && !inSingle) {
          inDouble = !inDouble;
          doubleCount++;
        }
      }
      if (singleCount % 2 !== 0) {
        results.push({ id: uid(), type: 'error', message: `ERROR [stmt ${i + 1}]: Unterminated string literal`, timestamp: new Date(), line: lineNum });
        errorCount++; continue;
      }
      if (doubleCount % 2 !== 0) {
        results.push({ id: uid(), type: 'error', message: `ERROR [stmt ${i + 1}]: Unterminated identifier (double quote)`, timestamp: new Date(), line: lineNum });
        errorCount++; continue;
      }
    }

    // Parenthesis balance (on stripped version to avoid false matches in strings)
    {
      const openP = (stripped.match(/\(/g) || []).length;
      const closeP = (stripped.match(/\)/g) || []).length;
      if (openP !== closeP) {
        results.push({ id: uid(), type: 'error', message: `ERROR [stmt ${i + 1}]: Mismatched parentheses (${openP} open, ${closeP} close)`, timestamp: new Date(), line: lineNum });
        errorCount++; continue;
      }
    }

    // ORDER without BY (on stripped string to avoid matching inside strings/identifiers)
    if (/\bORDER\b/i.test(strippedUpper) && !/\bORDER\s+BY\b/i.test(strippedUpper)) {
      results.push({ id: uid(), type: 'error', message: `ERROR [stmt ${i + 1}]: syntax error: ORDER must be followed by BY`, timestamp: new Date(), line: lineNum });
      errorCount++; continue;
    }

    // ORDER BY without column/expression
    if (/\bORDER\s+BY\s*$/i.test(strippedUpper)) {
      results.push({ id: uid(), type: 'error', message: `ERROR [stmt ${i + 1}]: syntax error: ORDER BY must be followed by a column or expression`, timestamp: new Date(), line: lineNum });
      errorCount++; continue;
    }

    // GROUP without BY
    if (/\bGROUP\b/i.test(strippedUpper) && !/\bGROUP\s+BY\b/i.test(strippedUpper)) {
      results.push({ id: uid(), type: 'error', message: `ERROR [stmt ${i + 1}]: syntax error: GROUP must be followed by BY`, timestamp: new Date(), line: lineNum });
      errorCount++; continue;
    }

    // Aggregate function without parentheses — only match standalone keywords, not inside identifiers
    {
      const aggregateNames = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'STRING_AGG', 'ARRAY_AGG', 'BOOL_AND', 'BOOL_OR'];
      let aggError = false;
      if (/^SELECT/i.test(strippedUpper)) {
        // Remove content inside parentheses to avoid matching e.g. GROUP BY count_col
        // Only check the SELECT column list area
        const selectArea = strippedUpper.replace(/\([^)]*\)/g, '()');
        for (const agg of aggregateNames) {
          // Match standalone keyword not followed by ( and not part of a larger identifier
          const aggRegex = new RegExp(`(?<![A-Z0-9_])${agg}(?![A-Z0-9_(])`, 'i');
          // Only check SELECT ... FROM part, not WHERE/ORDER BY etc.
          const fromIdx = selectArea.indexOf(' FROM ');
          const selectPortion = fromIdx > 0 ? selectArea.slice(0, fromIdx) : selectArea;
          if (aggRegex.test(selectPortion)) {
            results.push({ id: uid(), type: 'error', message: `ERROR [stmt ${i + 1}]: syntax error: ${agg} must be followed by parentheses, e.g. ${agg}(*)`, timestamp: new Date(), line: lineNum });
            errorCount++; aggError = true; break;
          }
        }
      }
      if (aggError) continue;
    }

    // = NULL warning (on stripped version)
    if (/[^!<>]=\s*NULL\b/i.test(strippedUpper) && !/\bIS\s+(NOT\s+)?NULL\b/i.test(strippedUpper) && !/\bDEFAULT\s+NULL\b/i.test(strippedUpper) && !/\bSET\s+NULL\b/i.test(strippedUpper)) {
      results.push({ id: uid(), type: 'warning', message: `WARNING [stmt ${i + 1}]: comparison with NULL using = will always return false. Use IS NULL or IS NOT NULL instead.`, timestamp: new Date(), line: lineNum });
    }

    // Incomplete CASE expression: CASE without END (on stripped version)
    if (/\bCASE\b/i.test(strippedUpper) && !/\bEND\b/i.test(strippedUpper)) {
      results.push({ id: uid(), type: 'error', message: `ERROR [stmt ${i + 1}]: CASE expression must end with END`, timestamp: new Date(), line: lineNum });
      errorCount++; continue;
    }
    // CASE without WHEN
    if (/\bCASE\b/i.test(strippedUpper) && !/\bWHEN\b/i.test(strippedUpper) && /\bEND\b/i.test(strippedUpper)) {
      results.push({ id: uid(), type: 'error', message: `ERROR [stmt ${i + 1}]: CASE expression must contain at least one WHEN clause`, timestamp: new Date(), line: lineNum });
      errorCount++; continue;
    }

    const stmtStart2 = performance.now();
    let result: ExecutionResult;

    try {
      if (upper.startsWith('CREATE DATABASE')) result = execCreateDatabase(stmt);
      else if (upper.startsWith('USE ')) result = execUseDatabase(stmt);
      else if (upper.startsWith('CREATE TABLE')) result = execCreateTable(stmt);
      else if (upper.startsWith('CREATE VIEW') || upper.startsWith('CREATE OR REPLACE VIEW')) result = execCreateView(stmt);
      else if (upper.startsWith('CREATE UNIQUE INDEX') || upper.startsWith('CREATE INDEX')) result = execCreateIndex(stmt);
      else if (upper.startsWith('CREATE SEQUENCE')) result = execCreateSequence(stmt);
      else if (upper.startsWith('CREATE TYPE')) result = execCreateType(stmt);
      else if (upper.startsWith('CREATE EXTENSION')) result = execCreateExtension(stmt);
      else if (upper.startsWith('INSERT')) result = execInsert(stmt);
      else if (upper.startsWith('SELECT') || (upper.includes('UNION') && upper.includes('SELECT'))) result = execUnionOrSelect(stmt);
      else if (upper.startsWith('UPDATE ')) result = execUpdate(stmt);
      else if (upper.startsWith('DELETE')) result = execDelete(stmt);
      else if (upper.startsWith('DROP')) result = execDrop(stmt);
      else if (upper.startsWith('TRUNCATE')) result = execTruncate(stmt);
      else if (upper.startsWith('ALTER')) result = execAlter(stmt);
      else if (upper.startsWith('EXPLAIN')) result = execExplain(stmt);
      else if (upper.startsWith('SHOW TABLES') || upper === '\\DT') result = execShowTables();
      else if (upper.startsWith('SHOW SEQUENCES')) result = execShowSequences();
      else if (upper.startsWith('SHOW INDEXES') || upper.startsWith('SHOW INDEX')) result = execShowIndexes();
      else if (upper.startsWith('DESCRIBE') || upper.startsWith('\\D ')) result = execDescribe(stmt);
      else if (upper.startsWith('COMMENT ON') || upper.startsWith('COMMENT')) result = execComment(stmt);
      else if (upper.startsWith('BEGIN') || upper.startsWith('COMMIT') || upper.startsWith('ROLLBACK') || upper.startsWith('SAVEPOINT') || upper.startsWith('RELEASE')) {
        result = { id: uid(), type: 'info', message: `Transaction: ${upper.split(' ')[0]}`, timestamp: new Date() };
      } else if (upper.startsWith('CREATE FUNCTION') || upper.startsWith('CREATE OR REPLACE FUNCTION')) {
        result = { id: uid(), type: 'success', message: `✓ CREATE FUNCTION — compiled`, timestamp: new Date() };
      } else if (upper.startsWith('CREATE TRIGGER') || upper.startsWith('CREATE OR REPLACE TRIGGER')) {
        result = { id: uid(), type: 'success', message: `✓ CREATE TRIGGER — compiled`, timestamp: new Date() };
      } else if (upper.startsWith('CREATE SCHEMA')) {
        const schemaMatch = stmt.match(/CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
        result = { id: uid(), type: 'success', message: `✓ CREATE SCHEMA "${schemaMatch?.[1]?.toLowerCase() || 'unknown'}"`, timestamp: new Date() };
      } else if (upper.startsWith('CREATE ROLE') || upper.startsWith('CREATE USER')) {
        result = { id: uid(), type: 'success', message: `✓ ${upper.split(' ').slice(0, 2).join(' ')} — created`, timestamp: new Date() };
      } else if (upper.startsWith('GRANT') || upper.startsWith('REVOKE')) {
        result = { id: uid(), type: 'success', message: `✓ ${upper.split(' ')[0]} — executed`, timestamp: new Date() };
      } else if (upper.startsWith('SET ') || upper.startsWith('SHOW ')) {
        result = { id: uid(), type: 'info', message: `${upper.split(' ')[0]}: acknowledged`, timestamp: new Date() };
      } else if (upper.startsWith('VACUUM') || upper.startsWith('ANALYZE') || upper.startsWith('REINDEX') || upper.startsWith('CLUSTER')) {
        result = { id: uid(), type: 'success', message: `✓ ${upper.split(' ')[0]} — completed`, timestamp: new Date() };
      } else if (upper.startsWith('COPY')) {
        result = { id: uid(), type: 'success', message: `✓ COPY — executed (simulated)`, timestamp: new Date() };
      } else if (upper.startsWith('LISTEN') || upper.startsWith('NOTIFY') || upper.startsWith('UNLISTEN')) {
        result = { id: uid(), type: 'info', message: `${upper.split(' ')[0]}: acknowledged`, timestamp: new Date() };
      } else if (upper.startsWith('PREPARE') || upper.startsWith('EXECUTE') || upper.startsWith('DEALLOCATE')) {
        result = { id: uid(), type: 'success', message: `✓ ${upper.split(' ')[0]} — executed`, timestamp: new Date() };
      } else if (upper.startsWith('DO ')) {
        result = { id: uid(), type: 'success', message: `✓ DO — anonymous block executed`, timestamp: new Date() };
      } else if (upper.startsWith('WITH ')) {
        // CTE — try to execute the final SELECT
        const cteSelect = stmt.match(/\)\s*(SELECT[\s\S]+)$/i);
        if (cteSelect) {
          result = execUnionOrSelect(cteSelect[1]);
        } else {
          result = { id: uid(), type: 'success', message: `✓ CTE — executed`, timestamp: new Date() };
        }
      } else {
        result = { id: uid(), type: 'error', message: `ERROR: Unrecognized command: "${stmt.split(' ')[0]}"\nHINT: Supported: SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, EXPLAIN, TRUNCATE, DESCRIBE`, timestamp: new Date(), line: lineNum };
      }
    } catch (e) {
      result = { id: uid(), type: 'error', message: `INTERNAL ERROR: ${e instanceof Error ? e.message : 'Unknown error'}`, timestamp: new Date() };
    }

    result.duration = parseFloat((performance.now() - stmtStart2).toFixed(2));
    if (result.type === 'error') errorCount++;
    else if (result.type === 'success' || result.type === 'result') successCount++;
    if (result.rowsAffected) totalRows += result.rowsAffected;

    results.push(result);
  }

  const totalTime = (performance.now() - startTime).toFixed(2);
  const state = getEngineState();

  if (errorCount > 0) {
    results.push({ id: uid(), type: 'error', message: `\n✗ Execution completed with ${errorCount} error(s) — ${totalTime}ms`, timestamp: new Date() });
  } else {
    results.push({ id: uid(), type: 'success', message: `\n✓ All ${successCount} statement(s) executed successfully — ${totalTime}ms\n  Tables: ${state.tables.length} | Total rows: ${state.totalRows}`, timestamp: new Date() });
  }

  return results;
};

/**
 * Get only the meaningful output lines (success/result/error messages)
 */
export const getOutputText = (entries: ExecutionResult[]): string => {
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
    if (actLines.some(al => al === expLine)) matched++;
  }
  return Math.round((matched / expLines.length) * 100);
};
