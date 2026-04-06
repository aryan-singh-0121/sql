import { useState, useEffect, useRef, forwardRef } from 'react';
import { ChevronUp, ChevronDown, Terminal, AlertCircle, CheckCircle2, Loader2, Play, Pause, SkipForward, Square, Database, RotateCcw, FileText, Clock, Cpu, Zap, Table } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/contexts/AppContext';
import { executeSQL, resetEngine, getEngineState, setEnabledExtensions, ExecutionResult } from '@/lib/sqlEngine';

export type OutputEntry = ExecutionResult;

interface OutputPanelProps {
  runTrigger: number;
  enabledExtensions?: string[];
}

const OutputPanel = forwardRef<HTMLDivElement, OutputPanelProps>(({ runTrigger, enabledExtensions: extIds }, ref) => {
  const { files, activeFileId } = useApp();
  const [entries, setEntries] = useState<ExecutionResult[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [isCompiling, setIsCompiling] = useState(false);
  const [debugPaused, setDebugPaused] = useState(false);
  const [debugLine, setDebugLine] = useState<number | null>(null);
  const [engineInfo, setEngineInfo] = useState({ tables: 0, totalRows: 0 });
  const [execTime, setExecTime] = useState<number | null>(null);
  const activeFile = files.find(f => f.id === activeFileId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (runTrigger === 0) return;
    if (!activeFile) return;

    setIsCompiling(true);
    setIsOpen(true);
    setDebugPaused(false);
    setDebugLine(null);
    setExecTime(null);

    const compilingId = Date.now().toString();
    const startTime = performance.now();

    setEntries(prev => [...prev, {
      id: compilingId,
      type: 'info',
      message: '⟳ Compiling...',
      timestamp: new Date(),
    }]);

    if (extIds) setEnabledExtensions(extIds);
    const runExecution = async () => {
      try {
        const results = await executeSQL(activeFile.content);
        
        const debugEntry = results.find(e => e.type === 'debug');
        if (debugEntry && debugEntry.line) {
          setDebugPaused(true);
          setDebugLine(debugEntry.line);
        }

        const state = getEngineState();
        setEngineInfo({ tables: state.tables.length, totalRows: state.totalRows });
        setExecTime(parseFloat((performance.now() - startTime).toFixed(2)));
        
        setEntries(prev => {
          const filtered = prev.filter(e => e.id !== compilingId);
          return [...filtered, ...results];
        });
      } finally {
        setIsCompiling(false);
      }
    };
    runExecution();

    return () => {};
  }, [runTrigger]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const handleReset = () => {
    resetEngine();
    setEntries([]);
    setEngineInfo({ tables: 0, totalRows: 0 });
    setExecTime(null);
  };

  const handleStepOver = () => {
    setDebugPaused(false);
    setDebugLine(null);
    setEntries(prev => [...prev, {
      id: Date.now().toString(),
      type: 'debug',
      message: `▶ Resumed execution from line ${debugLine}`,
      timestamp: new Date(),
    }]);
  };

  const handleStop = () => {
    setDebugPaused(false);
    setDebugLine(null);
    setEntries(prev => [...prev, {
      id: Date.now().toString(),
      type: 'info',
      message: '■ Debug session ended',
      timestamp: new Date(),
    }]);
  };

  const getIcon = (type: ExecutionResult['type']) => {
    switch (type) {
      case 'error': return <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />;
      case 'success': return <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />;
      case 'debug': return <Pause className="w-3.5 h-3.5 text-neon-orange shrink-0 mt-0.5" />;
      case 'warning': return <AlertCircle className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />;
      case 'plan': return <Cpu className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />;
      case 'result': return <Table className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />;
      default: return <Terminal className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />;
    }
  };

  const errorCount = entries.filter(e => e.type === 'error').length;
  const successCount = entries.filter(e => e.type === 'success').length;
  const resultCount = entries.filter(e => e.type === 'result').length;
  const stmtCount = entries.filter(e => e.type === 'success' || e.type === 'error' || e.type === 'result').length;

  return (
    <div className="flex flex-col h-full border-t border-border">
      {/* Enhanced Header */}
      <div className="h-10 md:h-8 bg-card flex items-center px-2 md:px-3 gap-1 md:gap-2 overflow-x-auto">
        {isCompiling ? (
          <Loader2 className="w-4 h-4 md:w-3.5 md:h-3.5 text-primary animate-spin shrink-0" />
        ) : (
          <Terminal className="w-4 h-4 md:w-3.5 md:h-3.5 text-primary shrink-0" />
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
          {isCompiling ? 'Executing...' : debugPaused ? 'Debug' : 'Output'}
        </span>

        {/* Stats badges */}
        <div className="flex gap-1 ml-1 shrink-0">
          {errorCount > 0 && (
            <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <AlertCircle className="w-2.5 h-2.5" />
              {errorCount}
            </span>
          )}
          {successCount > 0 && !isCompiling && (
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" />
              {successCount}
            </span>
          )}
          {resultCount > 0 && !isCompiling && (
            <span className="text-[10px] font-bold text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <Table className="w-2.5 h-2.5" />
              {resultCount}
            </span>
          )}
        </div>

        {/* Execution time */}
        {execTime !== null && !isCompiling && (
          <span className="text-[10px] font-mono text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
            <Zap className="w-2.5 h-2.5" />
            {execTime}ms
          </span>
        )}

        {/* Engine state - hidden on mobile */}
        {engineInfo.tables > 0 && (
          <span className="hidden md:flex text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded items-center gap-0.5">
            <Database className="w-2.5 h-2.5" />
            {engineInfo.tables}t/{engineInfo.totalRows}r
          </span>
        )}

        {/* Debug controls */}
        {debugPaused && (
          <div className="flex items-center gap-1 ml-2 shrink-0">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-primary hover:text-primary/80" onClick={handleStepOver} title="Step Over">
              <SkipForward className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-primary hover:text-primary/80" onClick={handleStepOver} title="Continue">
              <Play className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive/80" onClick={handleStop} title="Stop">
              <Square className="w-3.5 h-3.5" />
            </Button>
            <span className="text-[10px] text-neon-orange font-mono">L{debugLine}</span>
          </div>
        )}

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1 md:gap-2 shrink-0">
          <button onClick={handleReset} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted" title="Reset engine state">
            <RotateCcw className="w-3 h-3" /> <span className="hidden sm:inline">Reset</span>
          </button>
          <button onClick={() => setEntries([])} className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted">
            Clear
          </button>
          <button onClick={() => setIsOpen(!isOpen)} className="text-muted-foreground hover:text-foreground p-1">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {isCompiling && (
        <div className="h-0.5 bg-muted overflow-hidden">
          <div className="h-full bg-primary animate-compilation-bar" />
        </div>
      )}

      {/* Content */}
      {isOpen && (
        <div ref={scrollRef} className="flex-1 bg-editor-bg overflow-auto font-mono text-xs">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-4">
              <Terminal className="w-8 h-8 opacity-50" />
              <span className="text-center">Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground">Run</kbd> or <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground">F5</kbd> to execute SQL</span>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {entries.map(entry => (
                <div key={entry.id} className={`flex items-start gap-2 animate-fade-in rounded p-1 ${
                  entry.type === 'debug' ? 'bg-neon-orange/5 border-l-2 border-neon-orange' :
                  entry.type === 'plan' ? 'bg-blue-500/5 border-l-2 border-blue-400' :
                  entry.type === 'result' ? 'bg-cyan-500/5 border-l-2 border-cyan-400' :
                  entry.type === 'error' ? 'bg-destructive/5 border-l-2 border-destructive' :
                  entry.type === 'success' ? 'bg-primary/5 border-l-2 border-primary' : ''
                }`}>
                  {getIcon(entry.type)}
                  <div className="flex-1 min-w-0 overflow-x-auto">
                    <pre className={`whitespace-pre-wrap break-words leading-relaxed ${
                      entry.type === 'error' ? 'text-destructive' :
                      entry.type === 'success' ? 'text-primary' :
                      entry.type === 'result' ? 'text-foreground' :
                      entry.type === 'debug' ? 'text-neon-orange' :
                      entry.type === 'warning' ? 'text-yellow-500' :
                      entry.type === 'plan' ? 'text-blue-300' :
                      'text-muted-foreground'
                    }`}>
                      {entry.message}
                    </pre>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    {entry.duration !== undefined && (
                      <span className="text-[9px] text-muted-foreground/60 font-mono flex items-center gap-0.5">
                        <Clock className="w-2 h-2" />{entry.duration}ms
                      </span>
                    )}
                    {entry.rowsAffected !== undefined && entry.type === 'result' && (
                      <span className="text-[9px] text-cyan-400/70 font-mono">{entry.rowsAffected}r</span>
                    )}
                    {entry.line && entry.type !== 'debug' && (
                      <span className="text-[9px] text-muted-foreground/50 font-mono">L{entry.line}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

OutputPanel.displayName = 'OutputPanel';

export default OutputPanel;