import { useState, useRef, useEffect, forwardRef } from 'react';
import { X } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';

const EditorTabs = forwardRef<HTMLDivElement>((_, ref) => {
  const { files, activeFileId, setActiveFileId, deleteFile, renameFile } = useApp();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      renameFile(editingId, editValue);
    }
    setEditingId(null);
  };

  return (
    <>
      <div className="flex bg-tab-inactive border-b border-border overflow-x-auto">
        {files.map(file => (
          <div
            key={file.id}
            className={`group flex items-center gap-2 px-4 py-2 cursor-pointer text-xs font-mono border-r border-border transition-colors ${
              activeFileId === file.id
                ? 'bg-tab-active text-foreground border-t-2 border-t-primary'
                : 'text-muted-foreground hover:bg-muted/50'
            }`}
            onClick={() => setActiveFileId(file.id)}
            onDoubleClick={() => {
              setEditingId(file.id);
              setEditValue(file.name);
            }}
          >
            {editingId === file.id ? (
              <input
                ref={inputRef}
                className="bg-background text-foreground text-xs font-mono px-1 py-0.5 rounded border border-primary outline-none w-[120px]"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="truncate max-w-[120px]">{file.name}</span>
            )}
            {files.length > 1 && editingId !== file.id && (
              <button
                className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                onClick={e => { e.stopPropagation(); setDeleteTarget({ id: file.id, name: file.name }); }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null); }}
        fileName={deleteTarget?.name || ''}
        onConfirm={() => {
          if (deleteTarget) {
            deleteFile(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
});

EditorTabs.displayName = 'EditorTabs';

export default EditorTabs;
