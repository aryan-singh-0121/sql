import { useApp } from '@/contexts/AppContext';
import { Database, GitBranch, Save, Clock, CheckCircle2 } from 'lucide-react';

const StatusBar = () => {
  const { files, activeFileId, theme, autoSaveEnabled, autoSaveStatus } = useApp();
  const activeFile = files.find(f => f.id === activeFileId);
  const lineCount = activeFile ? activeFile.content.split('\n').length : 0;

  return (
    <div className="h-6 bg-status-bar border-t border-border flex items-center px-3 text-xs font-mono text-muted-foreground gap-4">
      <div className="flex items-center gap-1">
        <Database className="w-3 h-3 text-primary" />
        <span>PostgreSQL</span>
      </div>
      <div className="flex items-center gap-1">
        <GitBranch className="w-3 h-3" />
        <span>No DB Connected</span>
      </div>
      <span>Lines: {lineCount}</span>

      {/* Auto-save indicator */}
      {autoSaveEnabled && (
        <div className="flex items-center gap-1">
          {autoSaveStatus === 'saving' && (
            <>
              <Save className="w-3 h-3 text-primary animate-pulse" />
              <span className="text-primary">Saving...</span>
            </>
          )}
          {autoSaveStatus === 'saved' && (
            <>
              <CheckCircle2 className="w-3 h-3 text-primary" />
              <span className="text-primary">Saved</span>
            </>
          )}
          {autoSaveStatus === 'idle' && (
            <>
              <Clock className="w-3 h-3" />
              <span>Auto-save on</span>
            </>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        <span className="capitalize">{theme.replace('-', ' ')}</span>
        <span>UTF-8</span>
        <span>PGSQL</span>
      </div>
    </div>
  );
};

export default StatusBar;
