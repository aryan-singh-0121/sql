import { useState, useCallback, useEffect } from 'react';
import { Command } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useApp } from '@/contexts/AppContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: () => void;
  onDownload: () => void;
  onFormat?: () => void;
  onFindReplace?: () => void;
}

const CommandPalette = ({ open, onOpenChange, onRun, onDownload, onFormat, onFindReplace }: CommandPaletteProps) => {
  const [search, setSearch] = useState('');
  const { createFile, localSaveEnabled, files, activeFileId, deleteFile } = useApp();
  const navigate = useNavigate();

  const commands: CommandItem[] = [
    { id: 'run', label: 'Run SQL', shortcut: 'F5', action: () => { onRun(); onOpenChange(false); } },
    { id: 'new-file', label: 'New File', shortcut: 'Ctrl+N', action: () => { createFile('untitled'); onOpenChange(false); } },
    { id: 'new-file-named', label: 'New File (Named)', shortcut: 'Ctrl+Shift+N', action: () => { const n = prompt('File name:'); if (n) createFile(n); onOpenChange(false); } },
    { id: 'save', label: 'Save / Download File', shortcut: 'Ctrl+S', action: () => { onDownload(); onOpenChange(false); } },
    { id: 'close-tab', label: 'Close Current Tab', shortcut: 'Ctrl+W', action: () => {
      if (activeFileId && files.length > 1) { deleteFile(activeFileId); toast.success('File closed'); }
      onOpenChange(false);
    }},
    { id: 'next-tab', label: 'Next Tab', shortcut: 'Ctrl+Tab', action: () => { onOpenChange(false); } },
    { id: 'prev-tab', label: 'Previous Tab', shortcut: 'Ctrl+Shift+Tab', action: () => { onOpenChange(false); } },
    { id: 'format', label: 'Format SQL', shortcut: 'Ctrl+Shift+F', action: () => { onFormat?.(); onOpenChange(false); toast.success('SQL formatted'); } },
    { id: 'find', label: 'Find & Replace', shortcut: 'Ctrl+F', action: () => { onFindReplace?.(); onOpenChange(false); } },
    { id: 'practice', label: 'Open Practice Mode', action: () => { navigate('/practice'); onOpenChange(false); } },
    { id: 'home', label: 'Go to Home', action: () => { navigate('/'); onOpenChange(false); } },
    { id: 'admin', label: 'Open Admin Panel', action: () => { navigate('/admin'); onOpenChange(false); } },
    { id: 'delete', label: 'Delete Current File', action: () => {
      if (activeFileId) { deleteFile(activeFileId); toast.success('File deleted'); }
      onOpenChange(false);
    }},
  ];

  const filtered = commands.filter(c =>
    c.label.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border p-0 max-w-md top-[20%] translate-y-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Command className="w-4 h-4 text-primary" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Type a command..."
            className="border-0 bg-transparent h-8 text-sm text-foreground focus-visible:ring-0 p-0"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-auto py-1">
          {filtered.map(cmd => (
            <button
              key={cmd.id}
              onClick={cmd.action}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <span>{cmd.label}</span>
              {cmd.shortcut && (
                <kbd className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                  {cmd.shortcut}
                </kbd>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No commands found</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CommandPalette;
