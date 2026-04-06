import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SQLFolder {
  id: string;
  name: string;
}

export interface SQLFile {
  id: string;
  name: string;
  content: string;
  folderId?: string | null;
}

export interface PracticeQuestion {
  title: string;
  description: string;
  expectedOutput: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  youtubeVideoUrl?: string;
}

export interface AdminCredentials {
  username: string;
  password: string;
  passcode: string;
}

export interface AdminSettings {
  youtubeLinks: string[];
  termsLink: string;
  homeVideoUrl: string;
  homeImageUrl: string;
  logoUrl: string;
  faviconUrl: string;
  siteTitle: string;
  instagramUrl: string;
  instagramPopupEnabled: boolean;
  marqueeText: string;
  practiceQuestions: PracticeQuestion[];
  credentials: AdminCredentials;
}

export type EditorTheme = 
  | 'terminal-green' | 'ocean-blue' | 'midnight-black' | 'arctic-white'
  | 'sunset-orange' | 'lavender-purple' | 'ruby-red' | 'forest-dark'
  | 'cyberpunk-yellow' | 'dracula' | 'monokai' | 'nord';

interface AppContextType {
  files: SQLFile[];
  folders: SQLFolder[];
  activeFileId: string | null;
  theme: EditorTheme;
  localSaveEnabled: boolean;
  autoSaveEnabled: boolean;
  adminSettings: AdminSettings;
  isAdmin: boolean;
  autoSaveStatus: 'idle' | 'saving' | 'saved';
  setFiles: (files: SQLFile[]) => void;
  setFolders: (folders: SQLFolder[]) => void;
  setActiveFileId: (id: string | null) => void;
  setTheme: (theme: EditorTheme) => void;
  setLocalSaveEnabled: (enabled: boolean) => void;
  setAutoSaveEnabled: (enabled: boolean) => void;
  setAdminSettings: (settings: AdminSettings) => void;
  setIsAdmin: (isAdmin: boolean) => void;
  setAutoSaveStatus: (status: 'idle' | 'saving' | 'saved') => void;
  createFile: (name: string, folderId?: string | null) => void;
  deleteFile: (id: string) => void;
  renameFile: (id: string, newName: string) => void;
  updateFileContent: (id: string, content: string) => void;
  createFolder: (name: string) => void;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, newName: string) => void;
  moveFileToFolder: (fileId: string, folderId: string | null) => void;
}

// No default credentials - fetched server-side only

const defaultAdminSettings: AdminSettings = {
  youtubeLinks: [],
  termsLink: '',
  homeVideoUrl: '',
  homeImageUrl: '',
  logoUrl: '',
  faviconUrl: '',
  siteTitle: 'PG Compiler',
  instagramUrl: '',
  instagramPopupEnabled: true,
  marqueeText: '',
  practiceQuestions: [],
  credentials: { username: '', password: '', passcode: '' },
};

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [files, setFiles] = useState<SQLFile[]>(() => {
    const saved = localStorage.getItem('pgcompiler_files');
    if (saved) return JSON.parse(saved);
    return [{ id: '1', name: 'untitled.sql', content: '-- Write your PostgreSQL query here\nSELECT 1;\n', folderId: null }];
  });

  const [folders, setFolders] = useState<SQLFolder[]>(() => {
    const saved = localStorage.getItem('pgcompiler_folders');
    if (saved) return JSON.parse(saved);
    return [];
  });

  const [activeFileId, setActiveFileId] = useState<string | null>(() => {
    return localStorage.getItem('pgcompiler_activeFile') || '1';
  });

  const [theme, setTheme] = useState<EditorTheme>(() => {
    return (localStorage.getItem('pgcompiler_theme') as EditorTheme) || 'terminal-green';
  });

  const [localSaveEnabled, setLocalSaveEnabled] = useState(() => {
    return localStorage.getItem('pgcompiler_localSave') === 'true';
  });

  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    return localStorage.getItem('pgcompiler_autoSave') === 'true';
  });

  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const [adminSettings, setAdminSettingsState] = useState<AdminSettings>(defaultAdminSettings);
  const [isAdmin, setIsAdmin] = useState(false);

  // Fetch admin settings from Supabase on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('admin_settings_public' as any)
          .select('*')
          .eq('id', 1)
          .single();

        if (data && !error) {
          const d = data as any;
          setAdminSettingsState({
            youtubeLinks: d.youtube_links || [],
            termsLink: d.terms_link || '',
            homeVideoUrl: d.home_video_url || '',
            homeImageUrl: d.home_image_url || '',
            logoUrl: d.logo_url || '',
            faviconUrl: d.favicon_url || '',
            siteTitle: d.site_title || 'PG Compiler',
            instagramUrl: d.instagram_url || '',
            instagramPopupEnabled: d.instagram_popup_enabled ?? true,
            marqueeText: d.marquee_text || '',
            practiceQuestions: (d.practice_questions as PracticeQuestion[]) || [],
            credentials: { username: '', password: '', passcode: '' },
          });
        }
      } catch (e) {
        console.error('Failed to fetch admin settings:', e);
      }
    };
    fetchSettings();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('admin_settings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_settings' }, (payload) => {
        const d = payload.new as any;
        if (d) {
          setAdminSettingsState(prev => ({
            youtubeLinks: d.youtube_links || [],
            termsLink: d.terms_link || '',
            homeVideoUrl: d.home_video_url || '',
            homeImageUrl: d.home_image_url || '',
            logoUrl: d.logo_url || '',
            faviconUrl: d.favicon_url || '',
            siteTitle: d.site_title || 'PG Compiler',
            instagramUrl: d.instagram_url || '',
            instagramPopupEnabled: d.instagram_popup_enabled ?? true,
            marqueeText: d.marquee_text || '',
            practiceQuestions: (d.practice_questions as PracticeQuestion[]) || [],
            credentials: prev.credentials,
          }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Dynamically update favicon
  useEffect(() => {
    if (adminSettings.faviconUrl) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = adminSettings.faviconUrl;
    }
  }, [adminSettings.faviconUrl]);

  // Dynamically update page title
  useEffect(() => {
    if (adminSettings.siteTitle) {
      document.title = adminSettings.siteTitle;
    }
  }, [adminSettings.siteTitle]);

  // Save admin settings to Supabase
  const setAdminSettings = useCallback(async (settings: AdminSettings) => {
    setAdminSettingsState(settings);
    try {
      await supabase.functions.invoke('admin-update-settings', {
        body: {
          adminToken: 'authenticated',
          settings: {
            youtubeLinks: settings.youtubeLinks,
            termsLink: settings.termsLink,
            homeVideoUrl: settings.homeVideoUrl,
            homeImageUrl: settings.homeImageUrl,
            logoUrl: settings.logoUrl,
            faviconUrl: settings.faviconUrl,
            siteTitle: settings.siteTitle,
            instagramUrl: settings.instagramUrl,
            instagramPopupEnabled: settings.instagramPopupEnabled,
            marqueeText: settings.marqueeText,
            practiceQuestions: settings.practiceQuestions,
          },
        },
      });
    } catch (e) {
      console.error('Failed to update admin settings:', e);
    }
  }, []);

  // Keep local storage for user-specific settings
  useEffect(() => {
    localStorage.setItem('pgcompiler_files', JSON.stringify(files));
  }, [files]);

  useEffect(() => {
    localStorage.setItem('pgcompiler_folders', JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    if (activeFileId) localStorage.setItem('pgcompiler_activeFile', activeFileId);
  }, [activeFileId]);

  useEffect(() => {
    localStorage.setItem('pgcompiler_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('pgcompiler_localSave', String(localSaveEnabled));
  }, [localSaveEnabled]);

  useEffect(() => {
    localStorage.setItem('pgcompiler_autoSave', String(autoSaveEnabled));
  }, [autoSaveEnabled]);

  const createFile = useCallback((name: string, folderId?: string | null) => {
    const newFile: SQLFile = {
      id: Date.now().toString(),
      name: name.endsWith('.sql') ? name : `${name}.sql`,
      content: '-- New file\n',
      folderId: folderId || null,
    };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
  }, []);

  const deleteFile = useCallback((id: string) => {
    setFiles(prev => {
      const next = prev.filter(f => f.id !== id);
      if (next.length === 0) {
        const defaultFile: SQLFile = { id: Date.now().toString(), name: 'untitled.sql', content: '', folderId: null };
        // Set active to the new default file
        setTimeout(() => setActiveFileId(defaultFile.id), 0);
        return [defaultFile];
      }
      // If the deleted file was active, switch to the first remaining file
      setTimeout(() => {
        setActiveFileId(prev => {
          if (prev === id) {
            return next[0]?.id || null;
          }
          return prev;
        });
      }, 0);
      return next;
    });
  }, []);

  const renameFile = useCallback((id: string, newName: string) => {
    const name = newName.trim() || 'untitled.sql';
    setFiles(prev => prev.map(f => f.id === id ? { ...f, name: name.endsWith('.sql') ? name : `${name}.sql` } : f));
  }, []);

  const updateFileContent = useCallback((id: string, content: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, content } : f));
  }, []);

  const createFolder = useCallback((name: string) => {
    const newFolder: SQLFolder = { id: Date.now().toString(), name: name.trim() || 'New Folder' };
    setFolders(prev => [...prev, newFolder]);
  }, []);

  const deleteFolder = useCallback((id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    // Move files from deleted folder to root
    setFiles(prev => prev.map(f => f.folderId === id ? { ...f, folderId: null } : f));
  }, []);

  const renameFolder = useCallback((id: string, newName: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name: newName.trim() || 'Unnamed' } : f));
  }, []);

  const moveFileToFolder = useCallback((fileId: string, folderId: string | null) => {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, folderId } : f));
  }, []);

  return (
    <AppContext.Provider value={{
      files, folders, activeFileId, theme, localSaveEnabled, autoSaveEnabled, adminSettings, isAdmin, autoSaveStatus,
      setFiles, setFolders, setActiveFileId, setTheme, setLocalSaveEnabled, setAutoSaveEnabled,
      setAdminSettings, setIsAdmin, setAutoSaveStatus,
      createFile, deleteFile, renameFile, updateFileContent,
      createFolder, deleteFolder, renameFolder, moveFileToFolder,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
