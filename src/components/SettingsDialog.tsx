import { useState } from 'react';
import { Settings, ExternalLink, Shield, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useApp } from '@/contexts/AppContext';
import { useNavigate } from 'react-router-dom';
import ThemeSelector from './ThemeSelector';

const SettingsDialog = () => {
  const { localSaveEnabled, setLocalSaveEnabled, adminSettings } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Settings className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Settings
          </DialogTitle>
        </DialogHeader>

        <ThemeSelector />

        <div className="border-t border-border pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Save className="w-4 h-4 text-primary" />
              <span className="text-sm text-foreground">Save to local system</span>
            </div>
            <Switch checked={localSaveEnabled} onCheckedChange={setLocalSaveEnabled} />
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-6">Allow downloading SQL files to your device</p>
        </div>

        {adminSettings.termsLink && (
          <div className="border-t border-border pt-4 px-4">
            <a
              href={adminSettings.termsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              Terms & Conditions
            </a>
          </div>
        )}

        <div className="border-t border-border pt-4 px-4">
          <Button
            variant="outline"
            className="w-full border-border text-foreground hover:bg-muted"
            onClick={() => { setOpen(false); navigate('/admin'); }}
          >
            <Shield className="w-4 h-4 mr-2" />
            Admin Panel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
