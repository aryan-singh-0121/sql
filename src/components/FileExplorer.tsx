import { useState, useMemo, useRef, useEffect, forwardRef } from 'react';
import { File, FilePlus, Trash2, X, Database, Table2, Columns3, ChevronRight, ChevronDown, Pencil, FolderPlus, Folder, FolderOpen } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import { parseSQL, ParsedTable } from '@/lib/sqlParser';
import SchemaSheetDialog from '@/components/SchemaSheetDialog';

const FileExplorer = forwardRef<HTMLDivElement>((_, ref) => {
  const {
    files, folders, activeFileId, setActiveFileId, createFile, deleteFile, renameFile, setFiles,
    createFolder, deleteFolder, renameFolder, moveFileToFolder,
  } = useApp();

  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [createInFolderId, setCreateInFolderId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; type: 'file' | 'folder' } | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [sheetTable, setSheetTable] = useState<ParsedTable | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingType, setRenamingType] = useState<'file' | 'folder'>('file');
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string; name: string; type: 'file' | 'folder' } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const dragItemId = useRef<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      if (renamingType === 'file') renameFile(renamingId, renameValue);
      else renameFolder(renamingId, renameValue);
    }
    setRenamingId(null);
  };

  const handleCreateFile = (folderId?: string | null) => {
    if (newFileName.trim()) {
      createFile(newFileName.trim(), folderId);
      setNewFileName('');
      setIsCreating(false);
      setCreateInFolderId(null);
    }
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim());
      setNewFolderName('');
      setIsCreatingFolder(false);
    }
  };

  const toggleFile = (id: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleTable = (key: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const schemas = useMemo(() => {
    const map: Record<string, ReturnType<typeof parseSQL>> = {};
    files.forEach(f => { map[f.id] = parseSQL(f.content); });
    return map;
  }, [files]);

  const rootFiles = files.filter(f => !f.folderId);
  const folderFiles = (folderId: string) => files.filter(f => f.folderId === folderId);

  const renderFileRow = (file: typeof files[0]) => {
    const schema = schemas[file.id];
    const hasSchema = schema && (schema.databases.length > 0 || schema.tables.length > 0);
    const isExpanded = expandedFiles.has(file.id);

    return (
      <div key={file.id}>
        <div
          className={`group flex items-center gap-1 px-2 py-1.5 cursor-grab text-sm transition-colors ${
            activeFileId === file.id
              ? 'bg-sidebar-accent text-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
          } ${dragOverId === file.id ? 'border-t-2 border-primary' : ''}`}
          draggable={renamingId !== file.id}
          onDragStart={(e) => {
            dragItemId.current = file.id;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', file.id);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (dragItemId.current !== file.id) setDragOverId(file.id);
          }}
          onDragLeave={() => setDragOverId(null)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOverId(null);
            const fromId = dragItemId.current;
            const toId = file.id;
            if (fromId && fromId !== toId) {
              const newFiles = [...files];
              const fromIdx = newFiles.findIndex(f => f.id === fromId);
              const toIdx = newFiles.findIndex(f => f.id === toId);
              // Also move to same folder
              newFiles[fromIdx] = { ...newFiles[fromIdx], folderId: file.folderId };
              const [moved] = newFiles.splice(fromIdx, 1);
              newFiles.splice(toIdx, 0, moved);
              setFiles(newFiles);
            }
            dragItemId.current = null;
          }}
          onDragEnd={() => { dragItemId.current = null; setDragOverId(null); setDragOverFolder(null); }}
          onClick={() => setActiveFileId(file.id)}
          onContextMenu={e => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, id: file.id, name: file.name, type: 'file' });
          }}
        >
          {hasSchema ? (
            <button
              className="w-4 h-4 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={e => { e.stopPropagation(); toggleFile(file.id); }}
            >
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <File className="w-4 h-4 shrink-0 text-primary" />
          {renamingId === file.id ? (
            <input
              ref={renameInputRef}
              className="bg-background text-foreground text-xs font-mono px-1 py-0.5 rounded border border-primary outline-none flex-1 min-w-0"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenamingId(null);
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="truncate flex-1 font-mono text-xs">{file.name}</span>
          )}
          {renamingId !== file.id && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive shrink-0"
              onClick={e => { e.stopPropagation(); setDeleteTarget({ id: file.id, name: file.name, type: 'file' }); }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>

        {/* Schema tree */}
        {isExpanded && hasSchema && (
          <div className="animate-fade-in">
            {schema.databases.map((db, i) => (
              <div key={`db-${i}`} className="flex items-center gap-1 pl-8 pr-2 py-1 text-muted-foreground">
                <Database className="w-3 h-3 text-neon-cyan shrink-0" />
                <span className="font-mono text-[10px] truncate">{db.name}</span>
              </div>
            ))}
            {schema.tables.map((table, i) => {
              const tableKey = `${file.id}-${table.name}`;
              const isTableExpanded = expandedTables.has(tableKey);
              return (
                <div key={`table-${i}`}>
                  <div
                    className="flex items-center gap-1 pl-6 pr-2 py-1 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/30 cursor-pointer transition-colors"
                    onClick={() => toggleTable(tableKey)}
                  >
                    <button className="w-3 h-3 shrink-0 flex items-center justify-center">
                      {isTableExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                    </button>
                    <Table2 className="w-3 h-3 text-neon-orange shrink-0" />
                    <span className="font-mono text-[10px] truncate flex-1">{table.name}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-primary hover:text-primary/80"
                      onClick={e => { e.stopPropagation(); setSheetTable(table); }}
                      title="View as sheet"
                    >
                      <Columns3 className="w-3 h-3" />
                    </button>
                  </div>
                  {isTableExpanded && (
                    <div className="animate-fade-in">
                      {table.columns.map((col, ci) => (
                        <div key={ci} className="flex items-center gap-1 pl-12 pr-2 py-0.5 text-muted-foreground">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            col.constraints.includes('PK') ? 'bg-neon-orange' : 'bg-muted-foreground/40'
                          }`} />
                          <span className="font-mono text-[10px] truncate">{col.name}</span>
                          <span className="font-mono text-[9px] text-muted-foreground/60 ml-auto shrink-0">{col.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-sidebar border-r border-border flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Explorer</span>
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            onClick={() => { setIsCreatingFolder(true); setIsCreating(false); }}
            title="New Folder"
          >
            <FolderPlus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            onClick={() => { setIsCreating(true); setCreateInFolderId(null); setIsCreatingFolder(false); }}
            title="New File"
          >
            <FilePlus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* New folder input */}
      {isCreatingFolder && (
        <div className="px-2 py-2 border-b border-border flex gap-1">
          <Input
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
            placeholder="folder name"
            className="h-7 text-xs bg-muted border-border"
            autoFocus
          />
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setIsCreatingFolder(false)}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* New file input (root level) */}
      {isCreating && !createInFolderId && (
        <div className="px-2 py-2 border-b border-border flex gap-1">
          <Input
            value={newFileName}
            onChange={e => setNewFileName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateFile(null)}
            placeholder="filename.sql"
            className="h-7 text-xs bg-muted border-border"
            autoFocus
          />
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setIsCreating(false)}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-auto py-1">
        {/* Folders */}
        {folders.map(folder => {
          const isOpen = expandedFolders.has(folder.id);
          const fFiles = folderFiles(folder.id);

          return (
            <div key={folder.id}>
              <div
                className={`group flex items-center gap-1 px-2 py-1.5 cursor-pointer text-sm transition-colors text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground ${
                  dragOverFolder === folder.id ? 'bg-primary/10 border border-primary/30 rounded' : ''
                }`}
                onClick={() => toggleFolder(folder.id)}
                onContextMenu={e => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, id: folder.id, name: folder.name, type: 'folder' });
                }}
                onDragOver={e => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverFolder(folder.id);
                }}
                onDragLeave={() => setDragOverFolder(null)}
                onDrop={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverFolder(null);
                  const fileId = dragItemId.current;
                  if (fileId) {
                    moveFileToFolder(fileId, folder.id);
                    // Auto-expand folder
                    setExpandedFolders(prev => new Set(prev).add(folder.id));
                  }
                  dragItemId.current = null;
                }}
              >
                <button className="w-4 h-4 shrink-0 flex items-center justify-center">
                  {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                {isOpen ? <FolderOpen className="w-4 h-4 shrink-0 text-yellow-500" /> : <Folder className="w-4 h-4 shrink-0 text-yellow-500" />}
                {renamingId === folder.id ? (
                  <input
                    ref={renameInputRef}
                    className="bg-background text-foreground text-xs font-mono px-1 py-0.5 rounded border border-primary outline-none flex-1 min-w-0"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="truncate flex-1 font-mono text-xs font-semibold">{folder.name}</span>
                )}
                {renamingId !== folder.id && (
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground hover:text-primary shrink-0"
                      onClick={e => {
                        e.stopPropagation();
                        setIsCreating(true);
                        setCreateInFolderId(folder.id);
                        setExpandedFolders(prev => new Set(prev).add(folder.id));
                      }}
                      title="New file in folder"
                    >
                      <FilePlus className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-destructive hover:text-destructive shrink-0"
                      onClick={e => { e.stopPropagation(); setDeleteTarget({ id: folder.id, name: folder.name, type: 'folder' }); }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Files in folder + create input */}
              {isOpen && (
                <div className="pl-4">
                  {isCreating && createInFolderId === folder.id && (
                    <div className="px-2 py-1 flex gap-1">
                      <Input
                        value={newFileName}
                        onChange={e => setNewFileName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreateFile(folder.id)}
                        placeholder="filename.sql"
                        className="h-7 text-xs bg-muted border-border"
                        autoFocus
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setIsCreating(false); setCreateInFolderId(null); }}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  {fFiles.length === 0 && !isCreating && (
                    <div className="px-6 py-1 text-[10px] text-muted-foreground/50 italic">Empty folder</div>
                  )}
                  {fFiles.map(renderFileRow)}
                </div>
              )}
            </div>
          );
        })}

        {/* Root-level drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
          onDrop={e => {
            e.preventDefault();
            const fileId = dragItemId.current;
            if (fileId) moveFileToFolder(fileId, null);
            dragItemId.current = null;
            setDragOverFolder(null);
          }}
        >
          {rootFiles.map(renderFileRow)}
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-md animate-fade-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={() => {
              setRenamingId(contextMenu.id);
              setRenamingType(contextMenu.type);
              setRenameValue(contextMenu.name);
              setContextMenu(null);
            }}
          >
            <Pencil className="w-3 h-3" /> Rename
          </button>
          {contextMenu.type === 'folder' && (
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => {
                setIsCreating(true);
                setCreateInFolderId(contextMenu.id);
                setExpandedFolders(prev => new Set(prev).add(contextMenu.id));
                setContextMenu(null);
              }}
            >
              <FilePlus className="w-3 h-3" /> New File Here
            </button>
          )}
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-accent transition-colors"
            onClick={() => {
              setDeleteTarget({ id: contextMenu.id, name: contextMenu.name, type: contextMenu.type });
              setContextMenu(null);
            }}
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      )}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null); }}
        fileName={deleteTarget?.name || ''}
        onConfirm={() => {
          if (deleteTarget) {
            if (deleteTarget.type === 'file') deleteFile(deleteTarget.id);
            else deleteFolder(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />

      <SchemaSheetDialog
        table={sheetTable}
        onClose={() => setSheetTable(null)}
      />
    </div>
  );
});

FileExplorer.displayName = 'FileExplorer';

export default FileExplorer;
