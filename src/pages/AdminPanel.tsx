import { useState, useRef, DragEvent, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft, Plus, Trash2, Link2, Youtube, Image, Video, BookOpen, Lock, AlertTriangle, Type, Upload, ToggleLeft, ToggleRight, Puzzle, Pencil, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useApp } from '@/contexts/AppContext';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_EXTENSIONS, SQLExtension } from '@/components/ExtensionsPanel';

const SPAM_SITES = [
  'https://www.google.com', 'https://www.bing.com', 'https://www.yahoo.com',
  'https://www.wikipedia.org', 'https://www.reddit.com', 'https://www.amazon.com',
  'https://www.youtube.com', 'https://www.twitter.com', 'https://www.facebook.com',
  'https://www.instagram.com', 'https://www.linkedin.com', 'https://www.pinterest.com',
  'https://www.tumblr.com', 'https://www.quora.com', 'https://www.stackoverflow.com',
];

const AdminPanel = forwardRef<HTMLDivElement>((_, _ref) => {
  const navigate = useNavigate();
  const { isAdmin, setIsAdmin, adminSettings, setAdminSettings } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [newYtLink, setNewYtLink] = useState('');
  const [newQ, setNewQ] = useState({ title: '', description: '', expectedOutput: '', difficulty: 'easy' as 'easy' | 'medium' | 'hard', youtubeVideoUrl: '' });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editQ, setEditQ] = useState({ title: '', description: '', expectedOutput: '', difficulty: 'easy' as 'easy' | 'medium' | 'hard', youtubeVideoUrl: '' });
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [spamActive, setSpamActive] = useState(false);
  const [spamPopups, setSpamPopups] = useState<{ id: number; url: string; x: number; y: number }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isFaviconDragging, setIsFaviconDragging] = useState(false);
  const [isBgDragging, setIsBgDragging] = useState(false);
  const [dragQIndex, setDragQIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasscode, setNewPasscode] = useState('');

  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async () => {
    setLoginLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-login', {
        body: { username, password, passcode },
      });

      if (error || !data?.success) {
        const attempts = wrongAttempts + 1;
        setWrongAttempts(attempts);
        toast.error('Invalid credentials');
        
        if (attempts >= 3) {
          setSpamActive(true);
          const popups: { id: number; url: string; x: number; y: number }[] = [];
          for (let i = 0; i < 100; i++) {
            popups.push({
              id: i,
              url: SPAM_SITES[Math.floor(Math.random() * SPAM_SITES.length)],
              x: Math.random() * (window.innerWidth - 300),
              y: Math.random() * (window.innerHeight - 200),
            });
          }
          setSpamPopups(popups);
        }
      } else {
        setIsAdmin(true);
        setWrongAttempts(0);
        setSpamActive(false);
        setSpamPopups([]);
        toast.success('Admin access granted');
      }
    } catch {
      toast.error('Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const [currentPassword, setCurrentPassword] = useState('');
  const [currentPasscode, setCurrentPasscode] = useState('');

  const handleChangeCredentials = async () => {
    if (!currentPassword.trim() || !currentPasscode.trim()) {
      toast.error('Enter current password and passcode to verify identity');
      return;
    }
    if (!newUsername.trim() && !newPassword.trim() && !newPasscode.trim()) {
      toast.error('Enter at least one new field to update');
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-credentials', {
        body: {
          currentPassword: currentPassword.trim(),
          currentPasscode: currentPasscode.trim(),
          newUsername: newUsername.trim() || undefined,
          newPassword: newPassword.trim() || undefined,
          newPasscode: newPasscode.trim() || undefined,
        },
      });

      if (error || !data?.success) {
        toast.error(data?.message || 'Failed to update credentials');
        return;
      }

      setNewUsername('');
      setNewPassword('');
      setNewPasscode('');
      setCurrentPassword('');
      setCurrentPasscode('');
      toast.success('Credentials updated successfully');
    } catch {
      toast.error('Update failed');
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('assets')
        .getPublicUrl(fileName);

      setAdminSettings({ ...adminSettings, logoUrl: urlData.publicUrl });
      toast.success('Logo uploaded successfully!');
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleLogoUpload(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  // Favicon upload handlers
  const handleFaviconUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    setFaviconUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `favicon-${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('assets')
        .getPublicUrl(fileName);

      setAdminSettings({ ...adminSettings, faviconUrl: urlData.publicUrl });
      toast.success('Favicon uploaded successfully!');
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setFaviconUploading(false);
    }
  };

  const handleFaviconDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsFaviconDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFaviconUpload(file);
  };

  // Background image upload handlers
  const handleBgUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    setBgUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `bg-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(fileName);
      setAdminSettings({ ...adminSettings, homeImageUrl: urlData.publicUrl });
      toast.success('Background image uploaded!');
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setBgUploading(false);
    }
  };

  const handleBgDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsBgDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleBgUpload(file);
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
        {spamActive && (
          <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
            {spamPopups.map(popup => (
              <div
                key={popup.id}
                className="absolute bg-card border-2 border-destructive rounded-lg shadow-2xl animate-scale-in pointer-events-auto"
                style={{
                  left: popup.x,
                  top: popup.y,
                  width: 280,
                  animationDelay: `${popup.id * 20}ms`,
                }}
              >
                <div className="flex items-center gap-1 px-2 py-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-t-lg">
                  <AlertTriangle className="w-3 h-3" />
                  ⚠️ SYSTEM WARNING — UNAUTHORIZED ACCESS DETECTED
                </div>
                <div className="p-2 text-[9px] text-destructive font-mono">
                  <p>🔴 Malicious activity detected from your device</p>
                  <p>🔴 IP address logged & reported</p>
                  <p>🔴 System files may be compromised</p>
                  <p className="mt-1 text-foreground font-bold">Redirecting to: {popup.url}</p>
                </div>
              </div>
            ))}
            <div className="absolute inset-0 bg-destructive/5 animate-pulse pointer-events-none" />
          </div>
        )}

        <div className="w-full max-w-sm bg-card border border-border rounded-lg p-6 neon-border relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Admin Login</h1>
          </div>

          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] text-destructive font-bold">⚠️ ADMIN ACCESS ONLY</p>
                <p className="text-[10px] text-destructive/80 mt-1">
                  This is only for admin. Do not try to open, otherwise your system may be harmed by malicious files. 
                  All unauthorized access attempts are logged.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Input
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="bg-muted border-border text-foreground"
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="bg-muted border-border text-foreground"
            />
            <Input
              type="password"
              placeholder="Passcode"
              value={passcode}
              onChange={e => setPasscode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="bg-muted border-border text-foreground"
            />
            {wrongAttempts > 0 && wrongAttempts < 3 && (
              <p className="text-[10px] text-destructive font-mono">
                ⚠️ Wrong attempt {wrongAttempts}/3 — System will activate protection after 3 failed attempts
              </p>
            )}
            <Button onClick={handleLogin} disabled={loginLoading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              {loginLoading ? 'Verifying...' : 'Login'}
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => navigate('/editor')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Editor
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-border text-foreground" onClick={() => navigate('/editor')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Editor
            </Button>
            <Button variant="ghost" className="text-destructive" onClick={() => { setIsAdmin(false); navigate('/editor'); }}>
              Logout
            </Button>
          </div>
        </div>

        {/* Change Credentials */}
        <section className="bg-card border border-destructive/30 rounded-lg p-5 mb-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Lock className="w-5 h-5 text-destructive" />
            Change Admin Credentials
          </h2>
          <p className="text-xs text-muted-foreground mb-3">Verify your identity with current password & passcode, then set new values.</p>
          <div className="space-y-2 mb-3">
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Current Password (required)</label>
              <Input type="password" placeholder="Current Password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="bg-muted border-border text-foreground" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Current Passcode (required)</label>
              <Input type="password" placeholder="Current Passcode" value={currentPasscode} onChange={e => setCurrentPasscode(e.target.value)} className="bg-muted border-border text-foreground" />
            </div>
            <hr className="border-border my-2" />
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">New Username</label>
              <Input placeholder="New Username" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="bg-muted border-border text-foreground" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">New Password</label>
              <Input type="password" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="bg-muted border-border text-foreground" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-0.5 block">New Passcode</label>
              <Input type="password" placeholder="New Passcode" value={newPasscode} onChange={e => setNewPasscode(e.target.value)} className="bg-muted border-border text-foreground" />
            </div>
          </div>
          <Button onClick={handleChangeCredentials} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Update Credentials
          </Button>
        </section>

        {/* YouTube Links */}
        <section className="bg-card border border-border rounded-lg p-5 mb-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Youtube className="w-5 h-5 text-destructive" />
            YouTube Video Links (Popup)
          </h2>
          <p className="text-xs text-muted-foreground mb-3">These videos will randomly show as popups every 15 minutes in the editor.</p>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={newYtLink}
              onChange={e => setNewYtLink(e.target.value)}
              className="bg-muted border-border text-foreground"
            />
            <Button
              onClick={() => {
                if (newYtLink.trim()) {
                  setAdminSettings({ ...adminSettings, youtubeLinks: [...adminSettings.youtubeLinks, newYtLink.trim()] });
                  setNewYtLink('');
                  toast.success('Video link added');
                }
              }}
              className="bg-primary text-primary-foreground shrink-0"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {adminSettings.youtubeLinks.map((link, i) => (
              <div key={i} className="flex items-center gap-2 bg-muted rounded px-3 py-2 text-xs font-mono text-foreground">
                <span className="truncate flex-1">{link}</span>
                <button
                  className="text-destructive hover:text-destructive/80"
                  onClick={() => {
                    setAdminSettings({
                      ...adminSettings,
                      youtubeLinks: adminSettings.youtubeLinks.filter((_, idx) => idx !== i),
                    });
                    toast.success('Link removed');
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {adminSettings.youtubeLinks.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No video links added yet</p>
            )}
          </div>
        </section>

        {/* Terms & Conditions */}
        <section className="bg-card border border-border rounded-lg p-5 mb-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Link2 className="w-5 h-5 text-secondary" />
            Terms & Conditions Link
          </h2>
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/terms"
              value={adminSettings.termsLink}
              onChange={e => setAdminSettings({ ...adminSettings, termsLink: e.target.value })}
              className="bg-muted border-border text-foreground"
            />
          </div>
        </section>

        {/* Instagram Link */}
        <section className="bg-card border border-border rounded-lg p-5 mb-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Link2 className="w-5 h-5 text-pink-500" />
            Instagram Profile Link
          </h2>
          <p className="text-xs text-muted-foreground mb-3">This link will be used in the Instagram popup on the home page.</p>
          
          {/* On/Off Toggle */}
          <div className="flex items-center gap-3 mb-3 p-3 bg-muted rounded-lg">
            <button
              onClick={() => setAdminSettings({ ...adminSettings, instagramPopupEnabled: !adminSettings.instagramPopupEnabled })}
              className="flex items-center gap-2"
            >
              {adminSettings.instagramPopupEnabled ? (
                <ToggleRight className="w-8 h-8 text-primary" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-muted-foreground" />
              )}
            </button>
            <span className={`text-sm font-medium ${adminSettings.instagramPopupEnabled ? 'text-primary' : 'text-muted-foreground'}`}>
              Instagram Popup {adminSettings.instagramPopupEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="https://www.instagram.com/username/"
              value={adminSettings.instagramUrl || ''}
              onChange={e => setAdminSettings({ ...adminSettings, instagramUrl: e.target.value })}
              className="bg-muted border-border text-foreground"
              disabled={!adminSettings.instagramPopupEnabled}
            />
          </div>
        </section>

        <section className="bg-card border border-border rounded-lg p-5 mb-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Image className="w-5 h-5 text-primary" />
            Web Logo
          </h2>
          <p className="text-xs text-muted-foreground mb-3">Drag & drop an image or click to upload. Changes will be visible to all users globally.</p>
          
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
              isDragging 
                ? 'border-primary bg-primary/10' 
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleLogoUpload(file);
              }}
            />
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            {uploading ? (
              <p className="text-sm text-primary animate-pulse">Uploading...</p>
            ) : (
              <>
                <p className="text-sm text-foreground font-medium">Drop image here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG supported</p>
              </>
            )}
          </div>

          {/* Or paste URL */}
          <div className="mt-3">
            <p className="text-xs text-muted-foreground mb-1">Or paste a URL:</p>
            <div className="flex gap-2">
              <Input
                placeholder="https://example.com/logo.png"
                value={adminSettings.logoUrl}
                onChange={e => setAdminSettings({ ...adminSettings, logoUrl: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          {adminSettings.logoUrl && (
            <div className="mt-3 p-3 bg-muted rounded flex items-center gap-3">
              <img src={adminSettings.logoUrl} alt="Logo preview" className="h-8 w-auto object-contain" />
              <span className="text-xs text-muted-foreground">Preview</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-destructive"
                onClick={() => setAdminSettings({ ...adminSettings, logoUrl: '' })}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          )}
        </section>

        {/* Favicon - Drag & Drop */}
        <section className="bg-card border border-border rounded-lg p-5 mb-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Image className="w-5 h-5 text-primary" />
            Website Favicon
          </h2>
          <p className="text-xs text-muted-foreground mb-3">Drag & drop an image or click to upload a favicon. Recommended: 32x32 or 64x64 PNG/ICO.</p>
          
          <div
            onDrop={handleFaviconDrop}
            onDragOver={(e) => { e.preventDefault(); setIsFaviconDragging(true); }}
            onDragLeave={() => setIsFaviconDragging(false)}
            onClick={() => faviconInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
              isFaviconDragging 
                ? 'border-primary bg-primary/10' 
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }`}
          >
            <input
              ref={faviconInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFaviconUpload(file);
              }}
            />
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            {faviconUploading ? (
              <p className="text-sm text-primary animate-pulse">Uploading...</p>
            ) : (
              <>
                <p className="text-sm text-foreground font-medium">Drop favicon here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">PNG, ICO, SVG supported</p>
              </>
            )}
          </div>

          {/* Or paste URL */}
          <div className="mt-3">
            <p className="text-xs text-muted-foreground mb-1">Or paste a URL:</p>
            <div className="flex gap-2">
              <Input
                placeholder="https://example.com/favicon.png"
                value={adminSettings.faviconUrl}
                onChange={e => setAdminSettings({ ...adminSettings, faviconUrl: e.target.value })}
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          {adminSettings.faviconUrl && (
            <div className="mt-3 p-3 bg-muted rounded flex items-center gap-3">
              <img src={adminSettings.faviconUrl} alt="Favicon preview" className="h-8 w-8 object-contain" />
              <span className="text-xs text-muted-foreground">Preview</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-destructive"
                onClick={() => setAdminSettings({ ...adminSettings, faviconUrl: '' })}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          )}
        </section>

        {/* Website Title */}
        <section className="bg-card border border-border rounded-lg p-5 mb-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Type className="w-5 h-5 text-primary" />
            Website Title
          </h2>
          <p className="text-xs text-muted-foreground mb-3">This title appears in the browser tab. Changes apply instantly for all users.</p>
          <div className="flex gap-2">
            <Input
              placeholder="PG Compiler"
              value={adminSettings.siteTitle || ''}
              onChange={e => setAdminSettings({ ...adminSettings, siteTitle: e.target.value })}
              className="bg-muted border-border text-foreground"
            />
          </div>
          {adminSettings.siteTitle && (
            <p className="text-[10px] text-muted-foreground mt-2 font-mono">Preview: 🔖 {adminSettings.siteTitle}</p>
          )}
        </section>

        {/* Home Page Ticker Text */}
        <section className="bg-card border border-border rounded-lg p-5 mb-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Type className="w-5 h-5 text-primary" />
            Home Page Top Text (Typing Animation)
          </h2>
          <p className="text-xs text-muted-foreground mb-3">This text will display at the top of the home page with a typing & deleting loop animation.</p>
          <div className="flex gap-2">
            <Input
              placeholder="@Tech-info999"
              value={adminSettings.marqueeText || ''}
              onChange={e => setAdminSettings({ ...adminSettings, marqueeText: e.target.value })}
              className="bg-muted border-border text-foreground"
            />
          </div>
        </section>

        {/* Home Page Background Image */}
        <section className="bg-card border border-border rounded-lg p-5 mb-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Image className="w-5 h-5 text-primary" />
            Home Page Background Image
          </h2>
          <p className="text-xs text-muted-foreground mb-3">Drag & drop or click to upload a background image for the home page.</p>

          <div
            onDrop={handleBgDrop}
            onDragOver={(e) => { e.preventDefault(); setIsBgDragging(true); }}
            onDragLeave={() => setIsBgDragging(false)}
            onClick={() => bgInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isBgDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
            }`}
          >
            {bgUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-primary animate-bounce" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Drop image here or click to browse</p>
                <p className="text-[10px] text-muted-foreground/60">PNG, JPG, WEBP supported</p>
              </div>
            )}
            <input
              ref={bgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBgUpload(f); }}
            />
          </div>

          {adminSettings.homeImageUrl && (
            <div className="mt-3 space-y-2">
              <img src={adminSettings.homeImageUrl} alt="Background preview" className="w-full h-32 object-cover rounded-lg border border-border" />
              <div className="flex gap-2">
                <Input
                  value={adminSettings.homeImageUrl}
                  readOnly
                  className="bg-muted border-border text-foreground text-xs font-mono flex-1"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setAdminSettings({ ...adminSettings, homeImageUrl: '' })}
                >
                  Remove
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Home Page Video */}
        <section className="bg-card border border-border rounded-lg p-5 mb-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Video className="w-5 h-5 text-primary" />
            Home Page Video
          </h2>
          <div>
            <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Video className="w-3 h-3" /> YouTube Video URL
            </label>
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={adminSettings.homeVideoUrl}
              onChange={e => setAdminSettings({ ...adminSettings, homeVideoUrl: e.target.value })}
              className="bg-muted border-border text-foreground"
            />
          </div>
        </section>

        {/* Practice Questions */}
        <section className="bg-card border border-border rounded-lg p-5 mb-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-primary" />
            Practice Questions
          </h2>
          <p className="text-xs text-muted-foreground mb-3">Add SQL practice questions with difficulty level and optional YouTube video.</p>
          <div className="space-y-2 mb-4">
            <Input placeholder="Question title" value={newQ.title} onChange={e => setNewQ({ ...newQ, title: e.target.value })} className="bg-muted border-border text-foreground" />
            <Textarea placeholder="Description / instructions..." value={newQ.description} onChange={e => setNewQ({ ...newQ, description: e.target.value })} className="bg-muted border-border text-foreground min-h-[60px]" />
            <Input placeholder="Expected output (compiler result string)" value={newQ.expectedOutput} onChange={e => setNewQ({ ...newQ, expectedOutput: e.target.value })} className="bg-muted border-border text-foreground" />
            
            {/* Difficulty selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Difficulty:</span>
              {(['easy', 'medium', 'hard'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setNewQ({ ...newQ, difficulty: d })}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    newQ.difficulty === d
                      ? d === 'easy' ? 'bg-primary/20 border-primary text-primary' 
                        : d === 'medium' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500'
                        : 'bg-destructive/20 border-destructive text-destructive'
                      : 'bg-muted border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>

            {/* YouTube Video URL */}
            <div className="flex items-center gap-2">
              <Youtube className="w-4 h-4 text-destructive shrink-0" />
              <Input 
                placeholder="YouTube video URL (optional — shows below question)" 
                value={newQ.youtubeVideoUrl} 
                onChange={e => setNewQ({ ...newQ, youtubeVideoUrl: e.target.value })} 
                className="bg-muted border-border text-foreground" 
              />
            </div>

            <Button
              onClick={() => {
                if (newQ.title.trim() && newQ.expectedOutput.trim()) {
                  const questions = [...(adminSettings.practiceQuestions || []), { 
                    title: newQ.title,
                    description: newQ.description,
                    expectedOutput: newQ.expectedOutput,
                    difficulty: newQ.difficulty,
                    youtubeVideoUrl: newQ.youtubeVideoUrl.trim() || undefined,
                  }];
                  setAdminSettings({ ...adminSettings, practiceQuestions: questions });
                  setNewQ({ title: '', description: '', expectedOutput: '', difficulty: 'easy', youtubeVideoUrl: '' });
                  toast.success('Question added');
                } else {
                  toast.error('Title and expected output are required');
                }
              }}
              className="bg-primary text-primary-foreground"
            >
              <Plus className="w-4 h-4 mr-1" /> Add Question
            </Button>
          </div>
          <div className="space-y-2">
            {(adminSettings.practiceQuestions || []).map((q, i) => (
              <div
                key={i}
                draggable={editingIndex !== i}
                onDragStart={() => setDragQIndex(i)}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => {
                  if (dragQIndex !== null && dragQIndex !== i) {
                    const questions = [...(adminSettings.practiceQuestions || [])];
                    const [moved] = questions.splice(dragQIndex, 1);
                    questions.splice(i, 0, moved);
                    setAdminSettings({ ...adminSettings, practiceQuestions: questions });
                    toast.success('Question reordered');
                  }
                  setDragQIndex(null);
                }}
                onDragEnd={() => setDragQIndex(null)}
                className={`bg-muted rounded-lg px-3 py-2 transition-opacity ${dragQIndex === i ? 'opacity-50' : ''}`}
              >
                {editingIndex === i ? (
                  <div className="space-y-2">
                    <Input placeholder="Question title" value={editQ.title} onChange={e => setEditQ({ ...editQ, title: e.target.value })} className="bg-background border-border text-foreground" />
                    <Textarea placeholder="Description..." value={editQ.description} onChange={e => setEditQ({ ...editQ, description: e.target.value })} className="bg-background border-border text-foreground min-h-[60px]" />
                    <Input placeholder="Expected output" value={editQ.expectedOutput} onChange={e => setEditQ({ ...editQ, expectedOutput: e.target.value })} className="bg-background border-border text-foreground" />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Difficulty:</span>
                      {(['easy', 'medium', 'hard'] as const).map(d => (
                        <button
                          key={d}
                          onClick={() => setEditQ({ ...editQ, difficulty: d })}
                          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                            editQ.difficulty === d
                              ? d === 'easy' ? 'bg-primary/20 border-primary text-primary'
                                : d === 'medium' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500'
                                : 'bg-destructive/20 border-destructive text-destructive'
                              : 'bg-muted border-border text-muted-foreground hover:border-primary/50'
                          }`}
                        >
                          {d.charAt(0).toUpperCase() + d.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Youtube className="w-4 h-4 text-destructive shrink-0" />
                      <Input placeholder="YouTube video URL (optional)" value={editQ.youtubeVideoUrl} onChange={e => setEditQ({ ...editQ, youtubeVideoUrl: e.target.value })} className="bg-background border-border text-foreground" />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (editQ.title.trim() && editQ.expectedOutput.trim()) {
                            const questions = [...(adminSettings.practiceQuestions || [])];
                            questions[i] = { ...editQ, youtubeVideoUrl: editQ.youtubeVideoUrl.trim() || undefined };
                            setAdminSettings({ ...adminSettings, practiceQuestions: questions });
                            setEditingIndex(null);
                            toast.success('Question updated');
                          } else {
                            toast.error('Title and expected output are required');
                          }
                        }}
                        className="bg-primary text-primary-foreground"
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingIndex(null)} className="text-muted-foreground">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <GripVertical className="w-4 h-4 text-muted-foreground mt-1 cursor-grab shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-foreground">{q.title}</p>
                        {q.difficulty && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            q.difficulty === 'easy' ? 'bg-primary/20 text-primary'
                            : q.difficulty === 'medium' ? 'bg-yellow-500/20 text-yellow-500'
                            : 'bg-destructive/20 text-destructive'
                          }`}>
                            {q.difficulty.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{q.description}</p>
                      <p className="text-xs text-primary font-mono mt-1">Expected: {q.expectedOutput}</p>
                      {q.youtubeVideoUrl && (
                        <p className="text-[10px] text-destructive mt-0.5 flex items-center gap-1">
                          <Youtube className="w-3 h-3" /> {q.youtubeVideoUrl}
                        </p>
                      )}
                    </div>
                    <button
                      className="text-primary hover:text-primary/80 mt-1"
                      onClick={() => {
                        setEditingIndex(i);
                        setEditQ({
                          title: q.title,
                          description: q.description || '',
                          expectedOutput: q.expectedOutput,
                          difficulty: (q.difficulty as 'easy' | 'medium' | 'hard') || 'easy',
                          youtubeVideoUrl: q.youtubeVideoUrl || '',
                        });
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      className="text-destructive hover:text-destructive/80 mt-1"
                      onClick={() => {
                        const questions = (adminSettings.practiceQuestions || []).filter((_, idx) => idx !== i);
                        setAdminSettings({ ...adminSettings, practiceQuestions: questions });
                        toast.success('Question removed');
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {(!adminSettings.practiceQuestions || adminSettings.practiceQuestions.length === 0) && (
              <p className="text-xs text-muted-foreground italic">No questions added yet</p>
            )}
          </div>
        </section>

        {/* SQL Extensions Management */}
        <ExtensionsSection />
      </div>
    </div>
  );
});

// Extensions Management Section
const ExtensionsSection = () => {
  const [extensions] = useState<SQLExtension[]>(DEFAULT_EXTENSIONS);
  const [defaultEnabled, setDefaultEnabled] = useState<string[]>(() => {
    const saved = localStorage.getItem('pgcompiler_default_extensions');
    if (saved) try { return JSON.parse(saved); } catch {}
    return ['arya_sql'];
  });

  const toggleDefault = (id: string) => {
    setDefaultEnabled(prev => {
      const next = prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id];
      localStorage.setItem('pgcompiler_default_extensions', JSON.stringify(next));
      toast.success(`Default ${next.includes(id) ? 'enabled' : 'disabled'}`);
      return next;
    });
  };

  const categories = ['custom', 'performance', 'analytics', 'security', 'utility'] as const;

  return (
    <section className="bg-card border border-border rounded-lg p-5 mb-6">
      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
        <Puzzle className="w-5 h-5 text-primary" />
        Default SQL Extensions
      </h2>
      <p className="text-xs text-muted-foreground mb-4">Set which extensions are enabled by default for all users.</p>
      
      {categories.map(cat => {
        const catExts = extensions.filter(e => e.category === cat);
        if (catExts.length === 0) return null;
        return (
          <div key={cat} className="mb-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase mb-2">{cat}</h3>
            <div className="space-y-2">
              {catExts.map(ext => (
                <div key={ext.id} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{ext.icon}</span>
                    <div>
                      <span className="text-sm font-medium text-foreground">{ext.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">v{ext.version}</span>
                    </div>
                  </div>
                  <Switch
                    checked={defaultEnabled.includes(ext.id)}
                    onCheckedChange={() => toggleDefault(ext.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
};

AdminPanel.displayName = 'AdminPanel';

export default AdminPanel;
