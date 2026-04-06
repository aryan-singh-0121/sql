import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Table2 } from 'lucide-react';
import { ParsedTable } from '@/lib/sqlParser';

interface SchemaSheetDialogProps {
  table: ParsedTable | null;
  onClose: () => void;
}

const SchemaSheetDialog = React.forwardRef<HTMLDivElement, SchemaSheetDialogProps>(({ table, onClose }, ref) => {
  if (!table) return null;

  return (
    <Dialog open={!!table} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-border p-0 max-w-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/50">
          <Table2 className="w-4 h-4 text-neon-orange" />
          <h2 className="text-sm font-bold text-foreground font-mono">{table.name}</h2>
          <span className="text-[10px] text-muted-foreground">({table.columns.length} columns)</span>
        </div>

        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 text-muted-foreground font-semibold">#</th>
                <th className="text-left px-4 py-2 text-muted-foreground font-semibold">Column</th>
                <th className="text-left px-4 py-2 text-muted-foreground font-semibold">Type</th>
                <th className="text-left px-4 py-2 text-muted-foreground font-semibold">Constraints</th>
              </tr>
            </thead>
            <tbody>
              {table.columns.map((col, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2 text-foreground font-semibold">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        col.constraints.includes('PK') ? 'bg-neon-orange' :
                        col.constraints.includes('FK') ? 'bg-neon-cyan' :
                        'bg-muted-foreground/30'
                      }`} />
                      {col.name}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-primary">{col.type}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {col.constraints.map((c, ci) => (
                        <span
                          key={ci}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            c === 'PK' ? 'bg-neon-orange/20 text-neon-orange' :
                            c === 'FK' ? 'bg-neon-cyan/20 text-neon-cyan' :
                            c === 'NOT NULL' ? 'bg-destructive/20 text-destructive' :
                            'bg-muted text-muted-foreground'
                          }`}
                        >
                          {c}
                        </span>
                      ))}
                      {col.constraints.length === 0 && (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty state for table with no columns */}
        {table.columns.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-xs">
            No columns detected in this table definition.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});

SchemaSheetDialog.displayName = 'SchemaSheetDialog';

export default SchemaSheetDialog;
