import { useState, useCallback, useEffect, useRef, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Download, Play, AlignLeft, Search, Save, Timer, Puzzle, Menu, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import FileExplorer from '@/components/FileExplorer';
import CodeEditor, { CodeEditorHandle } from '@/components/CodeEditor';
import EditorTabs from '@/components/EditorTabs';
import StatusBar from '@/components/StatusBar';
import SettingsDialog from '@/components/SettingsDialog';
import YouTubePopup from '@/components/YouTubePopup';
import OutputPanel from '@/components/OutputPanel';
import CommandPalette from '@/components/CommandPalette';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import AryaCopilot from '@/components/AryaCopilot';
import ExtensionsPanel, { DEFAULT_EXTENSIONS, SQLExtension } from '@/components/ExtensionsPanel';
import { useApp } from '@/contexts/AppContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';

const AUTO_SAVE_INTERVAL = 30 * 1000; // 30 seconds

const EditorPage = forwardRef<HTMLDivElement>((_, _ref) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { 
    files, activeFileId, localSaveEnabled, createFile, deleteFile, 
    adminSettings, setActiveFileId, autoSaveEnabled, setAutoSaveEnabled,
    setAutoSaveStatus 
  } = useApp();
  const activeFile = files.find(f => f.id === activeFileId);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const codeEditorRef = useRef<CodeEditorHandle>(null);
  const [runTrigger, setRunTrigger] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [extensionsOpen, setExtensionsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [outputExpanded, setOutputExpanded] = useState(false);
  const [extensions, setExtensions] = useState<SQLExtension[]>(() => {
    const saved = localStorage.getItem('pgcompiler_extensions');
    if (saved) try { return JSON.parse(saved); } catch {}
    // Check for admin defaults
    const defaults = localStorage.getItem('pgcompiler_default_extensions');
    if (defaults) {
      try {
        const defaultIds = JSON.parse(defaults);
        return DEFAULT_EXTENSIONS.map(e => ({ ...e, enabled: defaultIds.includes(e.id) }));
      } catch {}
    }
    return DEFAULT_EXTENSIONS;
  });

  const toggleExtension = (id: string) => {
    setExtensions(prev => {
      const next = prev.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e);
      localStorage.setItem('pgcompiler_extensions', JSON.stringify(next));
      const ext = next.find(e => e.id === id)!;
      toast.success(`${ext.name} ${ext.enabled ? 'enabled' : 'disabled'}`);
      return next;
    });
  };

  const enabledExtCount = extensions.filter(e => e.enabled).length;

  const handleDownload = useCallback(() => {
    if (!activeFile) return;
    if (!localSaveEnabled) {
      toast.error('Enable "Save to local system" in Settings first');
      return;
    }
    const blob = new Blob([activeFile.content], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${activeFile.name}`);
  }, [activeFile, localSaveEnabled]);

  const handleRun = useCallback(() => {
    setRunTrigger(prev => prev + 1);
  }, []);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!autoSaveEnabled) return;

    const timer = setInterval(() => {
      // Trigger save animation
      setAutoSaveStatus('saving');
      
      // localStorage is already being saved via useEffect in AppContext
      // Just show the visual feedback
      setTimeout(() => {
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      }, 500);
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(timer);
  }, [autoSaveEnabled, setAutoSaveStatus]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleDownload();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createFile('untitled');
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (e.key === 'F5') {
        e.preventDefault();
        handleRun();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activeFileId && files.length > 1) {
          setDeleteConfirmOpen(true);
        }
      }
      if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const idx = files.findIndex(f => f.id === activeFileId);
        const next = (idx + 1) % files.length;
        setActiveFileId(files[next].id);
      }
      if (e.ctrlKey && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const idx = files.findIndex(f => f.id === activeFileId);
        const prev = (idx - 1 + files.length) % files.length;
        setActiveFileId(files[prev].id);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        const name = prompt('File name:');
        if (name) createFile(name);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        codeEditorRef.current?.format();
        toast.success('SQL formatted');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDownload, createFile, handleRun, files, activeFileId, setActiveFileId]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Mobile-friendly Toolbar */}
      <div className="h-12 md:h-10 bg-card border-b border-border flex items-center px-2 md:px-3 gap-1 md:gap-2">
        {/* Mobile menu toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 md:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 md:h-7 md:w-7 text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/')}
        >
          <Home className="w-5 h-5 md:w-4 md:h-4" />
        </Button>

        {adminSettings.logoUrl ? (
          <img src={adminSettings.logoUrl} alt="Logo" className="h-6 w-auto object-contain hidden sm:block" />
        ) : (
          <span className="text-sm font-semibold text-foreground neon-text hidden sm:block">PG Compiler</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Run button - always visible and touch-friendly */}
          <Button
            onClick={handleRun}
            className="h-9 md:h-7 px-4 md:px-3 text-sm md:text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1 touch-manipulation"
          >
            <Play className="w-4 h-4 md:w-3 md:h-3" />
            <span className="hidden xs:inline">Run</span>
          </Button>

          {/* Format - hidden on mobile */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => { codeEditorRef.current?.format(); toast.success('SQL formatted'); }}
            title="Format SQL (Ctrl+Shift+F)"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </Button>

          {/* Search - hidden on mobile */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => codeEditorRef.current?.findReplace()}
            title="Find & Replace (Ctrl+F)"
          >
            <Search className="w-3.5 h-3.5" />
          </Button>

          {/* Auto-save toggle - hidden on mobile */}
          <div className="hidden md:flex items-center gap-1 px-2 border-l border-border ml-1">
            <Timer className={`w-3 h-3 ${autoSaveEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="text-[10px] text-muted-foreground hidden lg:inline">Auto</span>
            <Switch
              checked={autoSaveEnabled}
              onCheckedChange={setAutoSaveEnabled}
              className="scale-75"
            />
          </div>

          <kbd
            className="hidden lg:inline-flex items-center text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono cursor-pointer hover:text-foreground"
            onClick={() => setCommandPaletteOpen(true)}
          >
            Ctrl+Shift+P
          </kbd>

          {localSaveEnabled && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:h-7 md:w-7 text-muted-foreground hover:text-foreground"
              onClick={handleDownload}
            >
              <Download className="w-5 h-5 md:w-4 md:h-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 md:h-7 md:w-7 text-muted-foreground hover:text-foreground relative"
            onClick={() => setExtensionsOpen(true)}
            title="SQL Extensions"
          >
            <Puzzle className="w-5 h-5 md:w-4 md:h-4" />
            {enabledExtCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 md:w-3.5 md:h-3.5 bg-primary text-primary-foreground text-[9px] md:text-[8px] font-bold rounded-full flex items-center justify-center">
                {enabledExtCount}
              </span>
            )}
          </Button>
          <SettingsDialog />
        </div>
      </div>

      {/* Main Layout */}
      {isMobile ? (
        // Mobile layout - stacked with collapsible panels
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Mobile Sidebar Overlay */}
          {sidebarOpen && (
            <div className="absolute inset-0 z-40 flex">
              <div className="w-64 bg-card border-r border-border h-full overflow-auto">
                <FileExplorer />
              </div>
              <div className="flex-1 bg-black/50" onClick={() => setSidebarOpen(false)} />
            </div>
          )}

          {/* Editor */}
          <div className={`flex-1 flex flex-col overflow-hidden ${outputExpanded ? 'h-1/3' : 'h-2/3'}`}>
            <EditorTabs />
            <CodeEditor ref={codeEditorRef} />
          </div>

          {/* Output toggle button for mobile */}
          <button 
            className="h-8 bg-card border-t border-border flex items-center justify-center gap-2 text-muted-foreground"
            onClick={() => setOutputExpanded(!outputExpanded)}
          >
            <span className="text-xs font-medium">Output</span>
            {outputExpanded ? <ChevronRight className="w-4 h-4 rotate-90" /> : <ChevronLeft className="w-4 h-4 rotate-90" />}
          </button>

          {/* Output Panel */}
          <div className={`${outputExpanded ? 'h-2/3' : 'h-1/3'} transition-all duration-200`}>
            <OutputPanel runTrigger={runTrigger} enabledExtensions={extensions.filter(e => e.enabled).map(e => e.id)} />
          </div>
        </div>
      ) : (
        // Desktop layout - resizable panels
        <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          <ResizablePanel defaultSize={18} minSize={10} maxSize={40}>
            <FileExplorer />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={82} minSize={40}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={65} minSize={20}>
                <div className="flex flex-col h-full overflow-hidden">
                  <EditorTabs />
                  <CodeEditor ref={codeEditorRef} />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={35} minSize={10} maxSize={70}>
                <OutputPanel runTrigger={runTrigger} enabledExtensions={extensions.filter(e => e.enabled).map(e => e.id)} />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      <StatusBar />
      <YouTubePopup />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onRun={handleRun}
        onDownload={handleDownload}
        onFormat={() => codeEditorRef.current?.format()}
        onFindReplace={() => codeEditorRef.current?.findReplace()}
      />
      <DeleteConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        fileName={activeFile?.name || ''}
        onConfirm={() => {
          if (activeFileId) {
            deleteFile(activeFileId);
            setDeleteConfirmOpen(false);
            toast.success('File deleted');
          }
        }}
      />
      <ExtensionsPanel
        open={extensionsOpen}
        onOpenChange={setExtensionsOpen}
        extensions={extensions}
        onToggle={toggleExtension}
      />
      <AryaCopilot />
    </div>
  );
});

EditorPage.displayName = 'EditorPage';

export default EditorPage;
