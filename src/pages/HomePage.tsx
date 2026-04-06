import { useNavigate } from 'react-router-dom';
import { useState, useEffect, forwardRef } from 'react';
import { Play, Database, Terminal, Code2, BookOpen, Instagram, X, ExternalLink, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/contexts/AppContext';
import AryaCopilot from '@/components/AryaCopilot';
import heroBg from '@/assets/hero-bg.jpg';

const SERVICES = [
  { name: 'HackNow', url: 'https://hack-now.lovable.app/', emoji: '🔓' },
  { name: 'OneShort', url: 'https://oneshort.lovable.app/', emoji: '🔗' },
  { name: 'Terms & Conditions', url: 'https://sqlarya-terms-conditions.lovable.app/', emoji: '📜' },
  { name: 'Cyber Illusion Nexus', url: 'https://cyber-illusion-nexus.lovable.app/', emoji: '🌐' },
  { name: 'Code With Aryan', url: 'https://code-with-aryan.lovable.app/', emoji: '💻' },
  { name: 'Coding With Aryan', url: 'https://codeing-with-aryan.lovable.app/', emoji: '⌨️' },
  { name: 'CrestPort', url: 'https://crest-port.lovable.app/', emoji: '🏗️' },
  { name: 'UltraLock', url: 'https://ultra-lock.my.canva.site/', emoji: '🔒' },
  { name: 'CoinBat Joy', url: 'https://coin-bat-joy.lovable.app/', emoji: '🪙' },
  { name: 'HashCat', url: 'https://hashcat.lovable.app/', emoji: '🐱' },
  { name: 'X-Betting', url: 'https://x-betting.lovable.app/', emoji: '🎰' },
  { name: 'X121', url: 'https://x121.lovable.app/', emoji: '🚀' },
  { name: 'Academy Reach', url: 'https://academyreach-system.lovable.app/', emoji: '🎓' },
];

const HomePage = forwardRef<HTMLDivElement>((_, ref) => {
  const navigate = useNavigate();
  const { adminSettings } = useApp();

  const marqueeText = adminSettings.marqueeText || '@Tech-info999';
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [charIndex, setCharIndex] = useState(0);
  const [showInstaPopup, setShowInstaPopup] = useState(false);

  const instaUrl = adminSettings.instagramUrl || 'https://www.instagram.com/_aryan_singh0121/';
  const instaHandle = instaUrl.match(/instagram\.com\/([^/]+)/)?.[1] || '_aryan_singh0121';

  useEffect(() => {
    const speed = isDeleting ? 50 : 100;
    const timeout = setTimeout(() => {
      if (!isDeleting) {
        setDisplayText(marqueeText.slice(0, charIndex + 1));
        setCharIndex(prev => prev + 1);
        if (charIndex + 1 >= marqueeText.length) {
          setTimeout(() => setIsDeleting(true), 1500);
        }
      } else {
        setDisplayText(marqueeText.slice(0, charIndex - 1));
        setCharIndex(prev => prev - 1);
        if (charIndex <= 1) {
          setIsDeleting(false);
        }
      }
    }, speed);
    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, marqueeText]);

  useEffect(() => {
    if (!adminSettings.instagramPopupEnabled) return;
    const dismissed = sessionStorage.getItem('insta_popup_dismissed');
    if (dismissed) return;
    const timer = setTimeout(() => setShowInstaPopup(true), 3000);
    return () => clearTimeout(timer);
  }, [adminSettings.instagramPopupEnabled]);

  const bgImage = adminSettings.homeImageUrl || heroBg;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Typing Ticker */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-background/80 backdrop-blur-md py-3 px-4 text-center border-b border-primary/30">
        <span className="font-bold text-lg md:text-2xl tracking-wider bg-gradient-to-r from-[hsl(var(--primary))] via-[hsl(var(--neon-cyan,180_100%_50%))] to-[hsl(var(--primary))] bg-clip-text text-transparent drop-shadow-lg">
          {displayText}
          <span className="inline-block w-[3px] h-6 bg-primary ml-1 animate-pulse align-middle rounded-full" />
        </span>
      </div>

      {/* Background */}
      <div className="absolute inset-0">
        <img src={bgImage} alt="PostgreSQL Compiler" className="w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        <div className="absolute inset-0 scanline pointer-events-none" />
      </div>

      {/* Admin Video */}
      {adminSettings.homeVideoUrl && (
        <div className="absolute top-4 right-4 z-20 w-64 rounded-lg overflow-hidden neon-border">
          <iframe
            src={adminSettings.homeVideoUrl.replace('watch?v=', 'embed/') + '?autoplay=1&mute=1'}
            className="w-full aspect-video"
            allow="autoplay; encrypted-media"
            allowFullScreen
            title="Channel Video"
          />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pt-16 pb-20">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-12 h-12 text-primary animate-pulse-neon" />
          <Terminal className="w-10 h-10 text-neon-cyan" />
        </div>

        <h1
          className="text-5xl md:text-7xl font-bold text-foreground mb-4 text-center cursor-default select-none"
          onClick={(e) => {
            if (e.detail === 3) navigate('/admin');
          }}
        >
          <span className="neon-text">PG</span> Compiler
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground mb-2 text-center max-w-xl font-mono">
          PostgreSQL Language Compiler & Editor
        </p>
        <p className="text-sm text-muted-foreground mb-10 text-center max-w-md">
          Write, compile, and test PostgreSQL queries with a powerful VS Code-like editor
        </p>

        <div className="flex gap-4 flex-wrap justify-center">
          <Button
            onClick={() => navigate('/editor')}
            className="group relative px-8 py-6 text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 neon-box rounded-lg transition-all duration-300"
          >
            <Code2 className="w-5 h-5 mr-2 inline" />
            Start Coding
            <Play className="w-4 h-4 ml-2 inline group-hover:translate-x-1 transition-transform" />
          </Button>

          <Button
            onClick={() => navigate('/practice')}
            variant="outline"
            className="group relative px-8 py-6 text-lg font-semibold border-primary/50 text-foreground hover:bg-primary/10 rounded-lg transition-all duration-300"
          >
            <BookOpen className="w-5 h-5 mr-2 inline" />
            Practice SQL
          </Button>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 max-w-3xl w-full">
          {[
            { icon: '⚡', title: 'Auto Suggestions', desc: 'VS Code-like IntelliSense for SQL' },
            { icon: '🔴', title: 'Error Detection', desc: 'Real-time syntax error highlights' },
            { icon: '📁', title: 'File Management', desc: 'Create, edit & delete SQL files' },
          ].map((f, i) => (
            <div key={i} className="glass rounded-lg p-5 border border-border hover:border-primary/50 transition-colors">
              <div className="text-2xl mb-2">{f.icon}</div>
              <h3 className="text-foreground font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Our Other Services */}
        <div className="mt-20 w-full max-w-5xl">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Globe className="w-6 h-6 text-primary" />
              <h2 className="text-3xl font-bold text-foreground">Our Other Services</h2>
            </div>
            <p className="text-sm text-muted-foreground">Explore our ecosystem of tools and platforms</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {SERVICES.map((service, i) => (
              <a
                key={i}
                href={service.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group glass rounded-lg p-4 border border-border hover:border-primary/60 transition-all duration-300 hover:scale-[1.03] hover:shadow-lg hover:shadow-primary/10 flex flex-col items-center text-center gap-2"
              >
                <span className="text-2xl">{service.emoji}</span>
                <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">
                  {service.name}
                </span>
                <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Instagram Popup */}
      {showInstaPopup && instaUrl && (
        <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-4 w-72 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600" />
            
            <button
              onClick={() => {
                setShowInstaPopup(false);
                sessionStorage.setItem('insta_popup_dismissed', 'true');
              }}
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mt-1">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center shrink-0">
                <Instagram className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Follow on Instagram</p>
                <p className="text-xs text-muted-foreground">@{instaHandle}</p>
              </div>
            </div>

            <a
              href={instaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block w-full text-center text-sm font-semibold py-2 rounded-lg bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 text-white hover:opacity-90 transition-opacity"
            >
              Follow Now
            </a>
          </div>
        </div>
      )}

      {/* Arya Copilot AI */}
      <AryaCopilot />
    </div>
  );
});

HomePage.displayName = 'HomePage';

export default HomePage;