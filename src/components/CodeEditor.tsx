import Editor, { OnMount } from '@monaco-editor/react';
import { useApp, EditorTheme } from '@/contexts/AppContext';
import { useRef, useCallback, useImperativeHandle, forwardRef, useState } from 'react';

const themeToMonaco: Record<EditorTheme, string> = {
  'terminal-green': 'vs-dark',
  'ocean-blue': 'vs-dark',
  'midnight-black': 'vs-dark',
  'arctic-white': 'vs',
  'sunset-orange': 'vs-dark',
  'lavender-purple': 'vs-dark',
  'ruby-red': 'vs-dark',
  'forest-dark': 'vs-dark',
  'cyberpunk-yellow': 'vs-dark',
  'dracula': 'vs-dark',
  'monokai': 'vs-dark',
  'nord': 'vs-dark',
};

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
  'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'VIEW', 'DATABASE',
  'SCHEMA', 'GRANT', 'REVOKE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL', 'CROSS', 'ON',
  'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL',
  'AS', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'UNION',
  'ALL', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT',
  'NOT NULL', 'UNIQUE', 'CHECK', 'CASCADE', 'RESTRICT', 'SERIAL',
  'INTEGER', 'VARCHAR', 'TEXT', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'NUMERIC',
  'FLOAT', 'DOUBLE', 'BIGINT', 'SMALLINT', 'DECIMAL', 'CHAR', 'BYTEA',
  'JSON', 'JSONB', 'ARRAY', 'UUID', 'INTERVAL', 'TIME', 'MONEY',
  'FUNCTION', 'RETURNS', 'LANGUAGE', 'PLPGSQL', 'DECLARE', 'VARIABLE',
  'IF', 'ELSIF', 'LOOP', 'FOR', 'WHILE', 'RETURN', 'RAISE', 'NOTICE',
  'TRIGGER', 'BEFORE', 'AFTER', 'EACH', 'ROW', 'EXECUTE', 'PROCEDURE',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CAST',
  'EXTRACT', 'NOW', 'CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_USER',
  'WITH', 'RECURSIVE', 'LATERAL', 'EXPLAIN', 'ANALYZE', 'VACUUM',
  'TRUNCATE', 'COPY', 'FETCH', 'CURSOR', 'CLOSE', 'OPEN',



// CHATGPT 🚫🚫🚫🚫
  'RETURNING','COLUMN',
'INTERSECT',
'EXCEPT',
'ILIKE',
'SIMILAR',
'USING',
'OVER',
'PARTITION',
'WINDOW',
'DISTINCT ON',
'LOCK',
'SHARE',
'MODE',
'OWNER',
'COMMENT',
'MATERIALIZED',
'REFRESH',
'LISTEN',
'NOTIFY',
'UNLISTEN',
'POLICY',
'ROLE',
'ROLES',
'SEQUENCE',
'SEQUENCES',
'TABLESPACE',
'TEMP',
'TEMPORARY',
'UNLOGGED',
'VALIDATE',
'RESET',
'RENAME',



'INTERVAL',
'CURRENT_TIME',
'CURRENT_ROLE',
'SESSION_USER',
'LOCALTIME',
'LOCALTIMESTAMP',
'OVERLAY',
'POSITION',
'SUBSTRING',
'TRIM',
'LEADING',
'TRAILING',
'BOTH',
'OVERLAPS',
'FREEZE',
'INCLUDING',
'EXCLUDING',
'RESTART',
'IDENTITY',
'GENERATED',
'ALWAYS',
'STORED',
'VIRTUAL',
'COLLATE',
'OPERATOR',
'FAMILY',
'FILTER',
'WINDOW',
'PARTITION',
'RANGE',
'ROWS',
'PRECEDING',
'FOLLOWING',
'CURRENT',
'ROW',
'FIRST',
'LAST',
'NEXT',
'PRIOR',
'ABSOLUTE',
'RELATIVE',
'FORWARD',
'BACKWARD',
'SCROLL',
'NO',
'DATA',
'ONLY',
'OF',
'WITHOUT',
'OVER',
'SEARCH',
'CYCLE',
];

export const formatSQL = (sql: string): string => {
  const majorKeywords = [
    'SELECT', 'FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT',
    'OFFSET', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
    'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'JOIN', 'INNER JOIN',
    'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON',
    'AND', 'OR', 'UNION', 'UNION ALL', 'BEGIN', 'COMMIT', 'ROLLBACK',
    'CREATE INDEX', 'CREATE FUNCTION', 'RETURNS', 'LANGUAGE',



'WITH',
'DISTINCT',
'CASE',
'WHEN',
'THEN',
'ELSE',
'END',
'USING',
'RETURNING',
'INTERSECT',
'EXCEPT',
'LEFT OUTER JOIN',
'RIGHT OUTER JOIN',
'FULL OUTER JOIN',
'DELETE',
'INSERT',
'INTO',
'ASC',
'DESC',

    'OVER',
'PARTITION BY',
'WINDOW',
'LATERAL',
'EXISTS',
'BETWEEN',
'LIKE',
'ILIKE',
'IN',
'IS',
'NULL',
'ASC',
'DESC',
'USING',
'LOCK',
'FOR',
'SHARE',
'NOWAIT',
'SKIP LOCKED',
'FETCH',
'NEXT',
'ROWS',
'ONLY',
'OFFSET FETCH',
'TABLE',
'VIEW',
'SEQUENCE',
'TRUNCATE',
'COPY',
'EXPLAIN',
'ANALYZE',
  ];
  let formatted = sql.trim();
  formatted = formatted.replace(/\s+/g, ' ');
  majorKeywords.forEach(kw => {
    const regex = new RegExp(`\\b(${kw})\\b`, 'gi');
    formatted = formatted.replace(regex, '\n$1');
  });
  const lines = formatted.split('\n').filter(l => l.trim());
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(AND|OR|ON)\b/i.test(trimmed)) {
      result.push('  ' + trimmed);
    } else if (/^(SET|VALUES)\b/i.test(trimmed) && result.length > 0) {
      result.push('  ' + trimmed);
    } else {
      result.push(trimmed);
    }
  }
  let output = result.join('\n');
  SQL_KEYWORDS.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'gi');
    output = output.replace(regex, kw);
  });
  const stmts = output.split(/;\s*/);
  output = stmts.filter(s => s.trim()).map(s => s.trim() + ';').join('\n\n');
  return output;
};

export interface CodeEditorHandle {
  format: () => void;
  findReplace: () => void;
  getBreakpoints: () => Set<number>;
}

const CodeEditor = forwardRef<CodeEditorHandle>((_, ref) => {
  const { files, activeFileId, theme, updateFileContent } = useApp();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const activeFile = files.find(f => f.id === activeFileId);
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  const decorationIds = useRef<string[]>([]);

  useImperativeHandle(ref, () => ({
    format: () => {
      if (!editorRef.current || !activeFile) return;
      const formatted = formatSQL(activeFile.content);
      editorRef.current.setValue(formatted);
      updateFileContent(activeFile.id, formatted);
    },
    findReplace: () => {
      if (!editorRef.current) return;
      editorRef.current.getAction('actions.find')?.run();
    },
    getBreakpoints: () => breakpoints,
  }));

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register SQL completions
    monaco.languages.registerCompletionItemProvider('pgsql', {
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions = SQL_KEYWORDS.map(kw => ({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
        }));
        return { suggestions };
      },
    });

    // Breakpoint click on gutter
    editor.onMouseDown((e: any) => {
      // type 2 = gutter glyph margin, type 3 = line numbers
      if (e.target?.type === 2 || e.target?.type === 3) {
        const lineNumber = e.target.position?.lineNumber;
        if (lineNumber) {
          setBreakpoints(prev => {
            const next = new Set(prev);
            if (next.has(lineNumber)) {
              next.delete(lineNumber);
            } else {
              next.add(lineNumber);
            }
            updateBreakpointDecorations(editor, monaco, next);
            return next;
          });
        }
      }
    });

    // Real-time SQL validation markers
    const validate = () => {
      const model = editor.getModel();
      if (!model) return;
      const text = model.getValue();
      const markers: any[] = [];
      const lines = text.split('\n');
      lines.forEach((line: string, i: number) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('--')) return;
        const singleQuotes = (trimmed.match(/'/g) || []).length;
        if (singleQuotes % 2 !== 0) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: 'Unclosed string literal',
            startLineNumber: i + 1, startColumn: 1,
            endLineNumber: i + 1, endColumn: line.length + 1,
          });
        }
        const openP = (trimmed.match(/\(/g) || []).length;
        const closeP = (trimmed.match(/\)/g) || []).length;
        if (openP > closeP) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: 'Possible unclosed parenthesis',
            startLineNumber: i + 1, startColumn: 1,
            endLineNumber: i + 1, endColumn: line.length + 1,
          });
        }
      });
      monaco.editor.setModelMarkers(model, 'sql-validator', markers);
    };
    editor.onDidChangeModelContent(validate);
    validate();
  }, []);

  const updateBreakpointDecorations = (editor: any, monaco: any, bps: Set<number>) => {
    const newDecorations = Array.from(bps).map(line => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        glyphMarginClassName: 'breakpoint-glyph',
        glyphMarginHoverMessage: { value: `Breakpoint at line ${line}` },
        className: 'breakpoint-line-highlight',
      },
    }));
    decorationIds.current = editor.deltaDecorations(decorationIds.current, newDecorations);
  };

  if (!activeFile) {
    return (
      <div className="flex-1 flex items-center justify-center bg-editor-bg">
        <p className="text-muted-foreground font-mono text-sm">No file selected</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <Editor
        height="100%"
        language="pgsql"
        theme={themeToMonaco[theme] || 'vs-dark'}
        value={activeFile.content}
        onChange={(value) => updateFileContent(activeFile.id, value || '')}
        onMount={handleMount}
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', monospace",
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          suggest: { showKeywords: true },
          quickSuggestions: true,
          wordBasedSuggestions: 'currentDocument',
          tabSize: 2,
          renderLineHighlight: 'all',
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          smoothScrolling: true,
          padding: { top: 10 },
          glyphMargin: true,
          folding: true,
          lineNumbersMinChars: 3,
        }}
      />
    </div>
  );
});

CodeEditor.displayName = 'CodeEditor';

export default CodeEditor;
