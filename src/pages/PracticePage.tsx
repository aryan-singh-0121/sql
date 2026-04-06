import { useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, Play, ChevronRight, BookOpen, Terminal, AlertCircle, Loader2, Youtube, Trophy, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useApp } from '@/contexts/AppContext';
import Editor from '@monaco-editor/react';
import { toast } from 'sonner';
import { executeSQL, getOutputText, calculateMatchPercentage, ExecutionResult } from '@/lib/sqlEngine';
type OutputEntry = ExecutionResult;

const PASS_THRESHOLD = 80;

const getDifficultyStyle = (d?: string) => {
  switch (d) {
    case 'easy': return 'bg-primary/15 text-primary border-primary/30';
    case 'medium': return 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30';
    case 'hard': return 'bg-destructive/15 text-destructive border-destructive/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const getYouTubeEmbedUrl = (url: string) => {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url.replace('watch?v=', 'embed/');
};

const PracticePage = forwardRef<HTMLDivElement>((_, _ref) => {
  const navigate = useNavigate();
  const { adminSettings, theme } = useApp();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [userCode, setUserCode] = useState('');
  const [result, setResult] = useState<'idle' | 'passed' | 'failed'>('idle');
  const [entries, setEntries] = useState<OutputEntry[]>([]);
  const [matchPercent, setMatchPercent] = useState(0);
  const [isCompiling, setIsCompiling] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const questions = adminSettings.practiceQuestions || [];
  const selected = selectedIdx !== null ? questions[selectedIdx] : null;

  useEffect(() => {
    if (selected) {
      setUserCode('-- Write your SQL here\n');
      setResult('idle');
      setEntries([]);
      setMatchPercent(0);
    }
  }, [selectedIdx]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const getMonacoTheme = () => {
    if (['arctic-white'].includes(theme)) return 'vs';
    return 'vs-dark';
  };

  const handleRun = useCallback(() => {
    if (!selected) return;
    const sql = userCode.trim();
    if (!sql || sql === '-- Write your SQL here') {
      toast.error('Write some SQL first');
      return;
    }

    setIsCompiling(true);
    setEntries([]);
    setResult('idle');
    setMatchPercent(0);

    setTimeout(async () => {
      const outputEntries = await executeSQL(sql);
      setEntries(outputEntries);

      const actualOutput = getOutputText(outputEntries);
      const expectedOutput = selected.expectedOutput;
      const percent = calculateMatchPercentage(expectedOutput, actualOutput);
      setMatchPercent(percent);

      if (percent >= PASS_THRESHOLD) {
        setResult('passed');
        toast.success(`✅ Passed! ${percent}% match`);
      } else {
        setResult('failed');
        toast.error(`❌ Failed — ${percent}% match (need ${PASS_THRESHOLD}%)`);
      }

      setIsCompiling(false);
    }, 800);
  }, [selected, userCode]);

  const getIcon = (type: OutputEntry['type']) => {
    switch (type) {
      case 'error': return <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />;
      case 'success': return <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />;
      default: return <Terminal className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />;
    }
  };

  // Question list view
  if (selectedIdx === null) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <BookOpen className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Practice SQL</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-6 ml-14">Solve SQL challenges and test your skills</p>

          {/* Stats bar */}
          {questions.length > 0 && (
            <div className="flex items-center gap-4 mb-6 p-3 bg-card border border-border rounded-lg">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <span className="text-sm text-foreground font-medium">{questions.length} Questions</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">
                  {questions.filter(q => q.difficulty === 'easy').length} Easy
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/15 text-yellow-500 border border-yellow-500/30">
                  {questions.filter(q => q.difficulty === 'medium').length} Medium
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-destructive/15 text-destructive border border-destructive/30">
                  {questions.filter(q => q.difficulty === 'hard').length} Hard
                </span>
              </div>
            </div>
          )}

          {questions.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No practice questions available yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Admin can add questions from the Admin Panel.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedIdx(i)}
                  className="w-full flex items-center gap-4 p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-all duration-200 text-left group hover:shadow-md hover:shadow-primary/5"
                >
                  <span className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-foreground font-semibold truncate">{q.title}</h3>
                      {q.difficulty && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${getDifficultyStyle(q.difficulty)}`}>
                          {q.difficulty.toUpperCase()}
                        </span>
                      )}
                      {q.youtubeVideoUrl && (
                        <Youtube className="w-3.5 h-3.5 text-destructive shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{q.description}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Practice editor view
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Toolbar */}
      <div className="h-10 bg-card border-b border-border flex items-center px-3 gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setSelectedIdx(null)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold text-foreground truncate">Q{selectedIdx + 1}: {selected?.title}</span>
        {selected?.difficulty && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${getDifficultyStyle(selected.difficulty)}`}>
            {selected.difficulty.toUpperCase()}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {result === 'passed' && <Trophy className="w-5 h-5 text-primary" />}
          {result === 'failed' && <XCircle className="w-5 h-5 text-destructive" />}
          <Button onClick={handleRun} disabled={isCompiling} className="h-7 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1">
            {isCompiling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            {isCompiling ? 'Compiling...' : 'Run'}
          </Button>
        </div>
      </div>

      {/* Main split */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Left: Question */}
        <div className="w-full md:w-[400px] md:min-w-[320px] border-b md:border-b-0 md:border-r border-border bg-card overflow-auto max-h-[40vh] md:max-h-none">
          <div className="p-5">
            <h2 className="text-lg font-bold text-foreground mb-3">{selected?.title}</h2>
            <p className="text-sm text-muted-foreground mb-5 whitespace-pre-wrap">{selected?.description}</p>
            <div className="bg-muted rounded-lg p-4 border border-border">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Expected Output</h4>
              <pre className="text-sm text-foreground font-mono whitespace-pre-wrap">{selected?.expectedOutput}</pre>
            </div>
          </div>

          {/* YouTube Video */}
          {selected?.youtubeVideoUrl && (
            <div className="px-5 pb-5">
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted border-b border-border">
                  <Youtube className="w-4 h-4 text-destructive" />
                  <span className="text-xs font-semibold text-muted-foreground">Related Video</span>
                </div>
                <iframe
                  src={getYouTubeEmbedUrl(selected.youtubeVideoUrl)}
                  className="w-full aspect-video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Related video"
                />
              </div>
            </div>
          )}
        </div>

        {/* Right: Editor + Output */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language="sql"
              theme={getMonacoTheme()}
              value={userCode}
              onChange={v => setUserCode(v || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                padding: { top: 10 },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
              }}
            />
          </div>

          {/* Output panel */}
          <div className="border-t border-border">
            <div className="h-7 bg-card flex items-center px-3 gap-2">
              {isCompiling ? (
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
              ) : (
                <Terminal className="w-3.5 h-3.5 text-primary" />
              )}
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {isCompiling ? 'Compiling...' : 'Output'}
              </span>
              {result !== 'idle' && (
                <span className={`text-xs font-bold ${result === 'passed' ? 'text-primary' : 'text-destructive'}`}>
                  {result === 'passed' ? '✅ PASSED' : '❌ FAILED'}
                </span>
              )}
            </div>

            {isCompiling && (
              <div className="h-0.5 bg-muted overflow-hidden">
                <div className="h-full bg-primary animate-compilation-bar" />
              </div>
            )}

            <div ref={scrollRef} className="h-40 bg-editor-bg overflow-auto font-mono text-xs">
              {entries.length === 0 && !isCompiling ? (
                <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
                  <Terminal className="w-4 h-4" />
                  Click Run to execute your SQL
                </div>
              ) : (
                <div className="p-2 space-y-0.5">
                  {entries.map(entry => (
                    <div key={entry.id} className="flex items-start gap-2 animate-fade-in">
                      {getIcon(entry.type)}
                      <pre className={`whitespace-pre-wrap break-all leading-relaxed ${
                        entry.type === 'error' ? 'text-destructive' :
                        entry.type === 'success' ? 'text-primary' :
                        entry.type === 'result' ? 'text-foreground' :
                        'text-muted-foreground'
                      }`}>
                        {entry.message}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Match percentage bar */}
            {result !== 'idle' && (
              <div className="bg-card border-t border-border px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Match Result</span>
                  <span className={`text-sm font-bold ${matchPercent >= PASS_THRESHOLD ? 'text-primary' : 'text-destructive'}`}>
                    {matchPercent}%
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground font-mono">=====</span>
                  <Progress
                    value={matchPercent}
                    className={`flex-1 h-3 ${matchPercent >= PASS_THRESHOLD ? '[&>div]:bg-primary' : '[&>div]:bg-destructive'}`}
                  />
                  <span className="text-[10px] text-muted-foreground font-mono">=====</span>
                </div>
                <div className="flex items-center justify-center mt-2 gap-2">
                  {matchPercent >= PASS_THRESHOLD ? (
                    <span className="text-xs font-bold text-primary flex items-center gap-1">
                      <Trophy className="w-4 h-4" /> PASSED — {matchPercent}% matched
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-destructive flex items-center gap-1">
                      <XCircle className="w-4 h-4" /> FAILED — {matchPercent}% matched (need ≥{PASS_THRESHOLD}%)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

PracticePage.displayName = 'PracticePage';

export default PracticePage;
