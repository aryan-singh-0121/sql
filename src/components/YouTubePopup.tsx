import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

const POPUP_INTERVAL = 15 * 60 * 1000; // 15 minutes
const AUTO_DISMISS = 60 * 1000; // 1 minute

const YouTubePopup = () => {
  const { adminSettings } = useApp();
  const [open, setOpen] = useState(false);
  const [currentLink, setCurrentLink] = useState('');
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>();

  const showRandom = useCallback(() => {
    if (adminSettings.youtubeLinks.length === 0) return;
    const idx = Math.floor(Math.random() * adminSettings.youtubeLinks.length);
    const link = adminSettings.youtubeLinks[idx];
    const embedUrl = link.replace('watch?v=', 'embed/').split('&')[0];
    setCurrentLink(embedUrl);
    setOpen(true);
  }, [adminSettings.youtubeLinks]);

  // Auto show every 15 min
  useEffect(() => {
    if (adminSettings.youtubeLinks.length === 0) return;
    const timer = setInterval(showRandom, POPUP_INTERVAL);
    return () => clearInterval(timer);
  }, [showRandom, adminSettings.youtubeLinks]);

  // Auto dismiss after 1 minute
  useEffect(() => {
    if (open) {
      dismissTimer.current = setTimeout(() => setOpen(false), AUTO_DISMISS);
    }
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [open]);

  if (!open || !currentLink) return null;

  return (
    <div className="fixed bottom-16 right-4 z-50 w-72 rounded-lg overflow-hidden border border-border bg-card shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center justify-between px-2 py-1 bg-muted">
        <span className="text-[10px] text-muted-foreground font-mono">Channel Video</span>
        <button
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-background transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <iframe
        src={`${currentLink}?autoplay=1&mute=1`}
        className="w-full aspect-video"
        allow="autoplay; encrypted-media"
        allowFullScreen
        title="Channel Video"
      />
    </div>
  );
};

export default YouTubePopup;
