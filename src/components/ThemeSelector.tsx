import { useApp, EditorTheme } from '@/contexts/AppContext';
import { Paintbrush } from 'lucide-react';

const themes: { id: EditorTheme; name: string; color: string }[] = [
  { id: 'terminal-green', name: 'Terminal Green', color: 'bg-green-500' },
  { id: 'ocean-blue', name: 'Ocean Blue', color: 'bg-blue-500' },
  { id: 'midnight-black', name: 'Midnight Black', color: 'bg-gray-900' },
  { id: 'arctic-white', name: 'Arctic White', color: 'bg-gray-100' },
  { id: 'sunset-orange', name: 'Sunset Orange', color: 'bg-orange-500' },
  { id: 'lavender-purple', name: 'Lavender Purple', color: 'bg-purple-500' },
  { id: 'ruby-red', name: 'Ruby Red', color: 'bg-red-500' },
  { id: 'forest-dark', name: 'Forest Dark', color: 'bg-emerald-800' },
  { id: 'cyberpunk-yellow', name: 'Cyberpunk Yellow', color: 'bg-yellow-400' },
  { id: 'dracula', name: 'Dracula', color: 'bg-purple-900' },
  { id: 'monokai', name: 'Monokai', color: 'bg-amber-700' },
  { id: 'nord', name: 'Nord', color: 'bg-sky-800' },
];

const ThemeSelector = () => {
  const { theme, setTheme } = useApp();

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Paintbrush className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Editor Theme</h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {themes.map(t => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono transition-all border ${
              theme === t.id
                ? 'border-primary bg-muted text-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-primary/50'
            }`}
          >
            <span className={`w-3 h-3 rounded-full ${t.color} shrink-0`} />
            <span className="truncate">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ThemeSelector;
