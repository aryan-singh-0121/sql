import React, { useState } from 'react';
import { Puzzle, Zap, Clock, BarChart3, Shield, Search, Globe, Database, Code2, Cpu, Layers, Star, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export interface SQLExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: React.ReactNode;
  category: 'performance' | 'analytics' | 'security' | 'utility' | 'custom';
  enabled: boolean;
  isCustom?: boolean;
  features?: string[];
}

const DEFAULT_EXTENSIONS: SQLExtension[] = [
  {
    id: 'arya_sql',
    name: 'arya.sql',
    version: '2.0.0',
    description: 'Ultra-fast SQL optimizer by Arya — auto-indexes, smart caching, query rewriting & parallel execution',
    icon: <Sparkles className="w-4 h-4 text-yellow-400" />,
    category: 'custom',
    enabled: true,
    isCustom: true,
    features: ['Auto-Index Detection', 'Smart Query Cache', 'Parallel Execution', 'Query Rewriter', 'Cost Optimizer', 'Instant EXPLAIN'],
  },
  {
    id: 'pg_cron',
    name: 'pg_cron',
    version: '1.6.2',
    description: 'Job scheduler for PostgreSQL — run periodic SQL statements on a schedule',
    icon: <Clock className="w-4 h-4 text-blue-400" />,
    category: 'utility',
    enabled: false,
    features: ['Cron-style scheduling', 'Background workers', 'Job logging'],
  },
  {
    id: 'timescaledb',
    name: 'TimescaleDB',
    version: '2.14.0',
    description: 'Time-series database extension — hypertables, continuous aggregates, compression',
    icon: <BarChart3 className="w-4 h-4 text-green-400" />,
    category: 'analytics',
    enabled: false,
    features: ['Hypertables', 'Continuous Aggregates', 'Data Compression', 'Real-time Analytics'],
  },
  {
    id: 'postgis',
    name: 'PostGIS',
    version: '3.4.2',
    description: 'Spatial and geographic objects for PostgreSQL',
    icon: <Globe className="w-4 h-4 text-cyan-400" />,
    category: 'analytics',
    enabled: false,
    features: ['Geometry Types', 'Spatial Indexing', 'Geocoding', 'Raster Support'],
  },
  {
    id: 'pg_stat_statements',
    name: 'pg_stat_statements',
    version: '1.10',
    description: 'Track execution statistics of all SQL statements',
    icon: <BarChart3 className="w-4 h-4 text-orange-400" />,
    category: 'performance',
    enabled: false,
    features: ['Query Statistics', 'Execution Counts', 'Mean Time Tracking'],
  },
  {
    id: 'pgcrypto',
    name: 'pgcrypto',
    version: '1.3',
    description: 'Cryptographic functions — hashing, encryption, random data',
    icon: <Shield className="w-4 h-4 text-red-400" />,
    category: 'security',
    enabled: false,
    features: ['SHA-256/512', 'AES Encryption', 'gen_random_uuid()', 'PGP Functions'],
  },
  {
    id: 'pg_trgm',
    name: 'pg_trgm',
    version: '1.6',
    description: 'Trigram matching for fuzzy text search and similarity',
    icon: <Search className="w-4 h-4 text-purple-400" />,
    category: 'utility',
    enabled: false,
    features: ['Fuzzy Search', 'Similarity Score', 'GIN/GiST Indexes', 'LIKE Optimization'],
  },
  {
    id: 'uuid_ossp',
    name: 'uuid-ossp',
    version: '1.1',
    description: 'Generate universally unique identifiers (UUIDs)',
    icon: <Cpu className="w-4 h-4 text-indigo-400" />,
    category: 'utility',
    enabled: false,
    features: ['uuid_generate_v4()', 'UUID v1/v3/v5', 'Nil UUID'],
  },
  {
    id: 'hstore',
    name: 'hstore',
    version: '1.8',
    description: 'Key-value pair storage within PostgreSQL',
    icon: <Database className="w-4 h-4 text-teal-400" />,
    category: 'utility',
    enabled: false,
    features: ['Key-Value Store', 'Operators', 'Indexing', 'Functions'],
  },
  {
    id: 'pg_partman',
    name: 'pg_partman',
    version: '5.0.1',
    description: 'Automated table partition management',
    icon: <Layers className="w-4 h-4 text-amber-400" />,
    category: 'performance',
    enabled: false,
    features: ['Auto Partitioning', 'Time-based', 'ID-based', 'Maintenance'],
  },
  {
    id: 'plpgsql_check',
    name: 'plpgsql_check',
    version: '2.7.0',
    description: 'Linter and validator for PL/pgSQL code',
    icon: <Code2 className="w-4 h-4 text-pink-400" />,
    category: 'utility',
    enabled: false,
    features: ['Static Analysis', 'Error Detection', 'Performance Hints'],
  },
  {
    id: 'pg_repack',
    name: 'pg_repack',
    version: '1.5.0',
    description: 'Online table reorganization without heavy locks',
    icon: <Zap className="w-4 h-4 text-yellow-300" />,
    category: 'performance',
    enabled: false,
    features: ['Online VACUUM FULL', 'No Long Locks', 'Index Rebuild'],
  },
  {
    id: 'citext',
    name: 'citext',
    version: '1.6',
    description: 'Case-insensitive text data type',
    icon: <Code2 className="w-4 h-4 text-lime-400" />,
    category: 'utility',
    enabled: false,
    features: ['Case-Insensitive Matching', 'Indexable', 'Locale Aware'],
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  custom: '⭐ Custom',
  performance: '⚡ Performance',
  analytics: '📊 Analytics',
  security: '🔒 Security',
  utility: '🔧 Utility',
};

interface ExtensionsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extensions: SQLExtension[];
  onToggle: (id: string) => void;
}

const ExtensionsPanel = React.forwardRef<HTMLDivElement, ExtensionsPanelProps>(({ open, onOpenChange, extensions, onToggle }, ref) => {
  const [expandedCat, setExpandedCat] = useState<Set<string>>(new Set(['custom', 'performance', 'analytics', 'security', 'utility']));
  const [search, setSearch] = useState('');

  if (!open) return null;

  const filtered = extensions.filter(ext =>
    ext.name.toLowerCase().includes(search.toLowerCase()) ||
    ext.description.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
    key,
    label,
    exts: filtered.filter(e => e.category === key),
  })).filter(g => g.exts.length > 0);

  const enabledCount = extensions.filter(e => e.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-[520px] max-h-[80vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-primary/10 to-purple-600/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Puzzle className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">SQL Extensions</h2>
              <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-mono">
                {enabledCount} active
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-muted-foreground">
              ✕
            </Button>
          </div>
          <input
            type="text"
            placeholder="Search extensions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mt-3 w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Extensions List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {grouped.map(group => (
            <div key={group.key}>
              <button
                onClick={() => {
                  setExpandedCat(prev => {
                    const next = new Set(prev);
                    next.has(group.key) ? next.delete(group.key) : next.add(group.key);
                    return next;
                  });
                }}
                className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 hover:text-foreground transition-colors w-full"
              >
                {expandedCat.has(group.key) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {group.label} ({group.exts.length})
              </button>

              {expandedCat.has(group.key) && (
                <div className="space-y-1.5 mb-3">
                  {group.exts.map(ext => (
                    <div
                      key={ext.id}
                      className={`rounded-lg border p-3 transition-all ${
                        ext.enabled
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border bg-muted/30 hover:border-border/80'
                      } ${ext.isCustom ? 'ring-1 ring-yellow-400/30' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{ext.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-foreground">{ext.name}</span>
                            <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              v{ext.version}
                            </span>
                            {ext.isCustom && (
                              <span className="text-[9px] font-bold text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <Star className="w-2.5 h-2.5" /> CUSTOM
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{ext.description}</p>
                          {ext.features && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {ext.features.map((f, i) => (
                                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">
                                  {f}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => onToggle(ext.id)}
                          className="shrink-0 mt-1"
                          title={ext.enabled ? 'Disable extension' : 'Enable extension'}
                        >
                          {ext.enabled ? (
                            <ToggleRight className="w-7 h-7 text-primary" />
                          ) : (
                            <ToggleLeft className="w-7 h-7 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-muted/30 text-center">
          <p className="text-[10px] text-muted-foreground">
            Extensions enhance your SQL engine with additional capabilities
          </p>
        </div>
      </div>
    </div>
  );
});

ExtensionsPanel.displayName = 'ExtensionsPanel';

export { DEFAULT_EXTENSIONS };
export default ExtensionsPanel;
