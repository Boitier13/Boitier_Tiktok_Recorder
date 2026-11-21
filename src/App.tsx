import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  Video, 
  Users, 
  FolderDown, 
  Settings, 
  Activity, 
  Plus, 
  Search, 
  Play, 
  Square, 
  Trash2, 
  Download, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  HardDrive, 
  Wifi, 
  WifiOff, 
  Bell, 
  ShieldAlert,
  RefreshCw,
  Terminal,
  Eye,
  Sliders,
  Check,
  X,
  Film
} from 'lucide-react';

interface Creator {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  isLive: boolean;
  isRecording: boolean;
  autoRecord: boolean;
  viewers: number;
  streamTitle?: string;
  lastChecked: string;
  category: string;
}

interface Recording {
  id: string;
  username: string;
  filename: string;
  startTime: string;
  duration: string;
  size: string;
  resolution: string;
  status: 'Completed' | 'Recording' | 'Failed';
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  username?: string;
}

interface SettingsConfig {
  checkInterval: number; // in seconds
  outputDir: string;
  videoQuality: string;
  autoStartEngine: boolean;
  notificationsEnabled: boolean;
  discordWebhook: string;
  segmentDuration: number; // minutes
}

const INITIAL_CREATORS: Creator[] = [
  {
    id: '1',
    username: 'charlidamelio',
    displayName: 'Charli D’Amelio',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    isLive: true,
    isRecording: true,
    autoRecord: true,
    viewers: 45200,
    streamTitle: 'Dancing and chilling with chat! Come say hi ✨',
    lastChecked: 'Just now',
    category: 'Dance & Lifestyle'
  },
  {
    id: '2',
    username: 'khaby.lame',
    displayName: 'Khabane Lame',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    isLive: false,
    isRecording: false,
    autoRecord: true,
    viewers: 0,
    lastChecked: '1 min ago',
    category: 'Comedy'
  },
  {
    id: '3',
    username: 'bellapoarch',
    displayName: 'Bella Poarch',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    isLive: true,
    isRecording: false,
    autoRecord: false,
    viewers: 28900,
    streamTitle: 'Q&A session & new song sneak peek! 🎵',
    lastChecked: 'Just now',
    category: 'Music'
  },
  {
    id: '4',
    username: 'mrbeast',
    displayName: 'MrBeast',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    isLive: false,
    isRecording: false,
    autoRecord: true,
    viewers: 0,
    lastChecked: '3 mins ago',
    category: 'Entertainment'
  }
];

const INITIAL_RECORDINGS: Recording[] = [
  {
    id: 'rec-1',
    username: 'charlidamelio',
    filename: 'charlidamelio_20261121_174000_live.mp4',
    startTime: 'Today, 17:40',
    duration: '0h 42m',
    size: '1.4 GB',
    resolution: '1080p 60fps',
    status: 'Completed'
  },
  {
    id: 'rec-2',
    username: 'bellapoarch',
    filename: 'bellapoarch_20261120_211530_live.mp4',
    startTime: 'Yesterday, 21:15',
    duration: '1h 12m',
    size: '2.8 GB',
    resolution: '1080p 60fps',
    status: 'Completed'
  },
  {
    id: 'rec-3',
    username: 'khaby.lame',
    filename: 'khaby.lame_20261119_150012_live.mp4',
    startTime: 'Nov 19, 15:00',
    duration: '0h 25m',
    size: '850 MB',
    resolution: '720p 30fps',
    status: 'Completed'
  }
];

const INITIAL_LOGS: LogEntry[] = [
  { id: 'l1', timestamp: '17:45:10', type: 'success', message: 'Engine connected to TikTok Live WebSocket API.', username: 'System' },
  { id: 'l2', timestamp: '17:45:12', type: 'info', message: 'Checked @charlidamelio — Status: LIVE (45.2k viewers)', username: 'charlidamelio' },
  { id: 'l3', timestamp: '17:45:12', type: 'success', message: 'Auto-recording started for @charlidamelio', username: 'charlidamelio' },
  { id: 'l4', timestamp: '17:45:15', type: 'info', message: 'Checked @khaby.lame — Status: OFFLINE', username: 'khaby.lame' },
  { id: 'l5', timestamp: '17:45:18', type: 'info', message: 'Checked @bellapoarch — Status: LIVE (28.9k viewers)', username: 'bellapoarch' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'creators' | 'recordings' | 'logs' | 'settings'>('dashboard');
  const [creators, setCreators] = useState<Creator[]>(INITIAL_CREATORS);
  const [recordings, setRecordings] = useState<Recording[]>(INITIAL_RECORDINGS);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const [isEngineRunning, setIsEngineRunning] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  const [settings, setSettings] = useState<SettingsConfig>({
    checkInterval: 30,
    outputDir: 'C:/BoitierRecordings/TikTok',
    videoQuality: '1080p60 (Highest)',
    autoStartEngine: true,
    notificationsEnabled: true,
    discordWebhook: 'https://discord.com/api/webhooks/example/token',
    segmentDuration: 30
  });

  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newUsername, setNewUsername] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('General');
  const [newAutoRecord, setNewAutoRecord] = useState<boolean>(true);

  // Preview / Player modal state
  const [previewRecording, setPreviewRecording] = useState<Recording | null>(null);

  // Toast notification
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Periodic simulation effect
  useEffect(() => {
    if (!isEngineRunning) return;
    const interval = setInterval(() => {
      // randomly toggle someone or add log
      setCreators(prev => prev.map(c => {
        const timeStr = new Date().toLocaleTimeString();
        if (Math.random() > 0.7) {
          const willBeLive = !c.isLive;
          const newRec = willBeLive && c.autoRecord && !c.isRecording;
          
          if (willBeLive && !c.isLive) {
            addLog('success', `Stream detected LIVE for @${c.username} (${Math.floor(Math.random() * 50000 + 5000)} viewers)`, c.username);
            showToast(`@${c.username} is now LIVE!`);
            if (c.autoRecord) {
              addLog('success', `Auto-recording initiated for @${c.username}`, c.username);
              // Add to recordings if not already
              const newRecObj: Recording = {
                id: 'rec-' + Date.now(),
                username: c.username,
                filename: `${c.username}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}_live.mp4`,
                startTime: 'Just now',
                duration: '0h 01m',
                size: '45 MB',
                resolution: '1080p 60fps',
                status: 'Recording'
              };
              setRecordings(r => [newRecObj, ...r]);
            }
          }
          return {
            ...c,
            isLive: willBeLive,
            isRecording: newRec ? true : c.isRecording,
            viewers: willBeLive ? Math.floor(Math.random() * 60000 + 2000) : 0,
            lastChecked: timeStr
          };
        }
        return c;
      }));
    }, 10000);

    return () => clearInterval(interval);
  }, [isEngineRunning]);

  const addLog = (type: LogEntry['type'], message: string, username?: string) => {
    const newEntry: LogEntry = {
      id: 'l-' + Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      username
    };
    setLogs(prev => [newEntry, ...prev.slice(0, 99)]);
  };

  const handleAddCreator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername) return;
    const cleanUsername = newUsername.replace('@', '').trim();
    const newCreatorObj: Creator = {
      id: 'c-' + Date.now(),
      username: cleanUsername,
      displayName: cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1),
      avatarUrl: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random()*999999)}?w=150&auto=format&fit=crop&q=80`,
      isLive: false,
      isRecording: false,
      autoRecord: newAutoRecord,
      viewers: 0,
      lastChecked: 'Just now',
      category: newCategory
    };
    setCreators([newCreatorObj, ...creators]);
    addLog('info', `Added creator @${cleanUsername} to monitoring list.`, cleanUsername);
    showToast(`Added @${cleanUsername} successfully!`);
    setNewUsername('');
    setShowAddModal(false);
  };

  const toggleRecording = (creatorId: string) => {
    setCreators(prev => prev.map(c => {
      if (c.id === creatorId) {
        const nextRecState = !c.isRecording;
        if (nextRecState) {
          addLog('success', `Manual recording started for @${c.username}`, c.username);
          showToast(`Started recording @${c.username}`);
          const newRecObj: Recording = {
            id: 'rec-' + Date.now(),
            username: c.username,
            filename: `${c.username}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}_manual.mp4`,
            startTime: 'Just now',
            duration: '0h 02m',
            size: '120 MB',
            resolution: '1080p 60fps',
            status: 'Recording'
          };
          setRecordings(r => [newRecObj, ...r]);
        } else {
          addLog('info', `Manual recording stopped for @${c.username}`, c.username);
          showToast(`Stopped recording @${c.username}`);
        }
        return { ...c, isRecording: nextRecState };
      }
      return c;
    }));
  };

  const deleteCreator = (id: string, username: string) => {
    setCreators(prev => prev.filter(c => c.id !== id));
    addLog('warning', `Removed creator @${username} from monitor.`, username);
    showToast(`Removed @${username}`);
  };

  const toggleAutoRecord = (id: string) => {
    setCreators(prev => prev.map(c => {
      if (c.id === id) {
        const updated = !c.autoRecord;
        showToast(`Auto-record for @${c.username} set to ${updated ? 'ON' : 'OFF'}`);
        return { ...c, autoRecord: updated };
      }
      return c;
    }));
  };

  const filteredCreators = creators.filter(c => {
    const matchesSearch = c.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.displayName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'All' || c.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const liveCount = creators.filter(c => c.isLive).length;
  const recordingCount = creators.filter(c => c.isRecording).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-rose-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center space-x-3 border border-rose-400 animate-bounce">
          <Radio className="w-5 h-5 animate-pulse" />
          <span className="font-semibold text-sm">{toast}</span>
        </div>
      )}

      {/* Top Header / Navigation Bar */}
      <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-rose-900/40">
            <Video className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold tracking-tight text-white">Boitier TikTok Recorder</h1>
              <span className="px-2 py-0.5 text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full">
                v2.4 Pro
              </span>
            </div>
            <p className="text-xs text-slate-400">Automated TikTok LIVE Surveillance & Recording Engine</p>
          </div>
        </div>

        {/* Engine status pills */}
        <div className="hidden md:flex items-center space-x-6 text-sm">
          <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
            <span className={`w-2.5 h-2.5 rounded-full ${isEngineRunning ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-slate-300 font-medium">Engine:</span>
            <span className={isEngineRunning ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
              {isEngineRunning ? 'Running' : 'Paused'}
            </span>
          </div>

          <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-300">Live Now:</span>
            <span className="font-bold text-cyan-300">{liveCount}</span>
          </div>

          <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
            <Radio className="w-4 h-4 text-rose-400 animate-pulse" />
            <span className="text-slate-300">Recording:</span>
            <span className="font-bold text-rose-400">{recordingCount}</span>
          </div>
        </div>

        {/* Engine Toggle Button */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setIsEngineRunning(!isEngineRunning);
              addLog(isEngineRunning ? 'warning' : 'success', isEngineRunning ? 'Engine paused by user.' : 'Engine resumed.');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 shadow-lg ${
              isEngineRunning 
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30' 
                : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-900/40'
            }`}
          >
            {isEngineRunning ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isEngineRunning ? 'Pause Engine' : 'Start Engine'}</span>
          </button>
        </div>
      </header>

      {/* Main Container with Sidebar / Tabs */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Sidebar Nav */}
        <aside className="w-full md:w-64 bg-slate-900/50 border-r border-slate-800 p-4 flex md:flex-col justify-between">
          <nav className="flex md:flex-col space-x-2 md:space-x-0 md:space-y-1.5 w-full overflow-x-auto">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Live Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('creators')}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition whitespace-nowrap ${
                activeTab === 'creators'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Monitored Creators</span>
              <span className="ml-auto bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full text-xs">
                {creators.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('recordings')}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition whitespace-nowrap ${
                activeTab === 'recordings'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FolderDown className="w-4 h-4" />
              <span>Recordings Library</span>
              <span className="ml-auto bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full text-xs">
                {recordings.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition whitespace-nowrap ${
                activeTab === 'logs'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>Engine Logs</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </nav>

          {/* Storage usage widget */}
          <div className="hidden md:block mt-auto bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="flex items-center space-x-1.5 font-medium text-slate-300">
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                <span>Storage (Output)</span>
              </span>
              <span>4.2 GB / 500 GB</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-cyan-500 to-rose-500 h-full w-[12%]" />
            </div>
            <p className="text-[11px] text-slate-500 mt-2 truncate">Dir: {settings.outputDir}</p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Top Banner / Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Monitored</p>
                    <h3 className="text-3xl font-extrabold text-white mt-1">{creators.length}</h3>
                    <p className="text-xs text-emerald-400 mt-1 flex items-center">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Active check loop
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <Users className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Currently LIVE</p>
                    <h3 className="text-3xl font-extrabold text-cyan-400 mt-1">{liveCount}</h3>
                    <p className="text-xs text-slate-400 mt-1">Streaming right now</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 animate-pulse">
                    <Wifi className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Recordings</p>
                    <h3 className="text-3xl font-extrabold text-rose-500 mt-1">{recordingCount}</h3>
                    <p className="text-xs text-rose-400 mt-1 flex items-center">
                      <Radio className="w-3.5 h-3.5 mr-1 animate-pulse" /> Saving to disk
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
                    <Video className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Check Interval</p>
                    <h3 className="text-3xl font-extrabold text-amber-400 mt-1">{settings.checkInterval}s</h3>
                    <p className="text-xs text-slate-400 mt-1">Next check in 4s</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <Clock className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* LIVE Now Feeds & Quick Grid */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                    <Radio className="w-5 h-5 text-rose-500 animate-pulse" />
                    <span>Live Feeds & Status</span>
                  </h2>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-rose-900/30 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Creator</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {creators.map(creator => (
                    <div 
                      key={creator.id}
                      className={`bg-slate-900/90 border rounded-2xl p-5 shadow-xl transition relative overflow-hidden flex flex-col justify-between ${
                        creator.isLive ? 'border-cyan-500/40 shadow-cyan-950/20' : 'border-slate-800'
                      }`}
                    >
                      {creator.isLive && (
                        <div className="absolute top-0 right-0 bg-cyan-500 text-slate-950 text-[10px] font-extrabold px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center space-x-1 shadow">
                          <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping mr-1" />
                          <span>LIVE</span>
                        </div>
                      )}

                      <div>
                        <div className="flex items-start space-x-4">
                          <img 
                            src={creator.avatarUrl} 
                            alt={creator.username}
                            className="w-14 h-14 rounded-2xl object-cover border-2 border-slate-700 shadow" 
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-white truncate text-base">{creator.displayName}</h4>
                            <p className="text-xs text-slate-400">@{creator.username}</p>
                            <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-medium bg-slate-800 text-slate-300 rounded-md">
                              {creator.category}
                            </span>
                          </div>
                        </div>

                        {creator.isLive && (
                          <div className="mt-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3">
                            <p className="text-xs font-medium text-cyan-200 line-clamp-2">
                              {creator.streamTitle || 'No stream title provided'}
                            </p>
                            <div className="mt-2 flex items-center justify-between text-xs text-cyan-400 font-semibold">
                              <span className="flex items-center">
                                <Eye className="w-3.5 h-3.5 mr-1" /> {creator.viewers.toLocaleString()} viewers
                              </span>
                              <span>Checked {creator.lastChecked}</span>
                            </div>
                          </div>
                        )}

                        {!creator.isLive && (
                          <div className="mt-4 bg-slate-800/40 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs text-slate-400">
                            <span className="flex items-center">
                              <WifiOff className="w-3.5 h-3.5 mr-1 text-slate-500" /> Offline
                            </span>
                            <span>Last checked: {creator.lastChecked}</span>
                          </div>
                        )}
                      </div>

                      {/* Card Action footer */}
                      <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <label className="text-xs text-slate-400 font-medium cursor-pointer flex items-center space-x-1.5">
                            <input 
                              type="checkbox" 
                              checked={creator.autoRecord} 
                              onChange={() => toggleAutoRecord(creator.id)}
                              className="rounded border-slate-700 bg-slate-800 text-rose-500 focus:ring-0 w-4 h-4 cursor-pointer"
                            />
                            <span>Auto-Rec</span>
                          </label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => toggleRecording(creator.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
                              creator.isRecording
                                ? 'bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-900/40'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                            }`}
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>{creator.isRecording ? 'Recording...' : 'Record'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CREATORS MANAGEMENT */}
          {activeTab === 'creators' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Monitored Creators</h2>
                  <p className="text-xs text-slate-400">Manage TikTok accounts tracked by the Boitier engine</p>
                </div>
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Search creators..." 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-rose-900/30 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Creator</span>
                  </button>
                </div>
              </div>

              {/* Creators Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-800/60 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-5">Creator</th>
                        <th className="py-3 px-5">Category</th>
                        <th className="py-3 px-5">Status</th>
                        <th className="py-3 px-5">Auto-Record</th>
                        <th className="py-3 px-5">Last Checked</th>
                        <th className="py-3 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs">
                      {filteredCreators.map(creator => (
                        <tr key={creator.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-4 px-5">
                            <div className="flex items-center space-x-3">
                              <img src={creator.avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover border border-slate-700" />
                              <div>
                                <p className="font-bold text-white">{creator.displayName}</p>
                                <p className="text-slate-400">@{creator.username}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-5">
                            <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 font-medium">
                              {creator.category}
                            </span>
                          </td>
                          <td className="py-4 px-5">
                            {creator.isLive ? (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                                <span>LIVE ({creator.viewers.toLocaleString()})</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-slate-400">
                                <span className="w-2 h-2 rounded-full bg-slate-600" />
                                <span>Offline</span>
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-5">
                            <button
                              onClick={() => toggleAutoRecord(creator.id)}
                              className={`px-3 py-1 rounded-lg font-semibold text-[11px] transition ${
                                creator.autoRecord 
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                  : 'bg-slate-800 text-slate-500'
                              }`}
                            >
                              {creator.autoRecord ? 'Enabled' : 'Disabled'}
                            </button>
                          </td>
                          <td className="py-4 px-5 text-slate-400">{creator.lastChecked}</td>
                          <td className="py-4 px-5 text-right space-x-2">
                            <button
                              onClick={() => toggleRecording(creator.id)}
                              className={`p-2 rounded-xl transition ${
                                creator.isRecording 
                                  ? 'bg-rose-600 text-white animate-pulse' 
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              }`}
                              title={creator.isRecording ? 'Stop Recording' : 'Start Recording'}
                            >
                              <Video className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteCreator(creator.id, creator.username)}
                              className="p-2 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-xl transition"
                              title="Delete Creator"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RECORDINGS LIBRARY */}
          {activeTab === 'recordings' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Recordings Library</h2>
                  <p className="text-xs text-slate-400">Saved MP4 files recorded from TikTok LIVE sessions</p>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-xs text-slate-300 flex items-center space-x-2">
                    <Film className="w-4 h-4 text-rose-500" />
                    <span>Total Recordings: <strong className="text-white">{recordings.length}</strong></span>
                  </div>
                </div>
              </div>

              {/* Recordings Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {recordings.map(rec => (
                  <div key={rec.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 font-bold">
                            MP4
                          </div>
                          <div>
                            <h4 className="font-bold text-white text-sm">@{rec.username}</h4>
                            <p className="text-[11px] text-slate-400">{rec.startTime}</p>
                          </div>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          rec.status === 'Completed' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 animate-pulse'
                        }`}>
                          {rec.status}
                        </span>
                      </div>

                      <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 space-y-1.5 text-xs">
                        <p className="text-slate-300 font-mono truncate">{rec.filename}</p>
                        <div className="flex items-center justify-between text-slate-400 text-[11px]">
                          <span>Duration: {rec.duration}</span>
                          <span>Size: {rec.size}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">Resolution: {rec.resolution}</div>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
                      <button
                        onClick={() => setPreviewRecording(rec)}
                        className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
                      >
                        <Play className="w-3.5 h-3.5 text-rose-400" />
                        <span>Preview</span>
                      </button>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => showToast(`Downloading ${rec.filename}...`)}
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition"
                          title="Download File"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setRecordings(prev => prev.filter(r => r.id !== rec.id));
                            showToast(`Deleted recording ${rec.filename}`);
                          }}
                          className="p-2 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-xl transition"
                          title="Delete Recording"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: ENGINE LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Engine Activity Logs</h2>
                  <p className="text-xs text-slate-400">Real-time diagnostic stream from the recorder engine</p>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setLogs([])}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Logs</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 font-mono text-xs shadow-xl h-[550px] overflow-y-auto space-y-2">
                {logs.map(log => (
                  <div key={log.id} className="flex items-start space-x-3 py-1.5 border-b border-slate-800/50">
                    <span className="text-slate-500 text-[11px] whitespace-nowrap">[{log.timestamp}]</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap ${
                      log.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                      log.type === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                      log.type === 'error' ? 'bg-rose-500/20 text-rose-400' : 'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {log.type}
                    </span>
                    {log.username && (
                      <span className="text-rose-400 font-semibold">@{log.username}</span>
                    )}
                    <span className="text-slate-300 flex-1">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h2 className="text-xl font-bold text-white">Engine Settings</h2>
                <p className="text-xs text-slate-400">Configure recording quality, polling frequency, and output paths</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-2">Check Interval (Seconds)</label>
                    <input 
                      type="number" 
                      value={settings.checkInterval}
                      onChange={e => setSettings({...settings, checkInterval: Number(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">How often the engine queries TikTok API for LIVE updates.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-2">Default Video Quality</label>
                    <select 
                      value={settings.videoQuality}
                      onChange={e => setSettings({...settings, videoQuality: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                    >
                      <option>1080p60 (Highest)</option>
                      <option>1080p30 (High)</option>
                      <option>720p60 (Balanced)</option>
                      <option>Audio Only (.mp3 / .aac)</option>
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">Target resolution for automated stream downloads.</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Output Recordings Directory</label>
                  <input 
                    type="text" 
                    value={settings.outputDir}
                    onChange={e => setSettings({...settings, outputDir: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Discord Webhook Notification URL</label>
                  <input 
                    type="text" 
                    value={settings.discordWebhook}
                    onChange={e => setSettings({...settings, discordWebhook: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Receive automated Discord alerts when your favorite creators start streaming.</p>
                </div>

                <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-white">Auto-Start Engine on Boot</span>
                    <p className="text-[11px] text-slate-400">Launch recording daemon immediately upon application start.</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.autoStartEngine}
                    onChange={e => setSettings({...settings, autoStartEngine: e.target.checked})}
                    className="w-5 h-5 rounded border-slate-700 bg-slate-950 text-rose-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => showToast('Settings saved successfully!')}
                    className="bg-rose-600 hover:bg-rose-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-rose-900/40 transition"
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add Creator Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <Users className="w-5 h-5 text-rose-500" />
                <span>Add TikTok Creator</span>
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCreator} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">TikTok Username / Handle</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-500 font-semibold">@</span>
                  <input 
                    type="text" 
                    placeholder="charlidamelio"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Category</label>
                <select 
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                >
                  <option value="Dance & Lifestyle">Dance & Lifestyle</option>
                  <option value="Comedy">Comedy</option>
                  <option value="Music">Music</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Gaming">Gaming</option>
                  <option value="General">General</option>
                </select>
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <input 
                  type="checkbox" 
                  id="modalAutoRec"
                  checked={newAutoRecord}
                  onChange={e => setNewAutoRecord(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-rose-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="modalAutoRec" className="text-xs font-medium text-slate-300 cursor-pointer">
                  Enable automated recording when LIVE starts
                </label>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40 transition"
                >
                  Add Creator
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Video Preview Modal */}
      {previewRecording && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Stream Recording Preview</h3>
                <p className="text-xs text-slate-400 font-mono">@{previewRecording.username} — {previewRecording.filename}</p>
              </div>
              <button 
                onClick={() => setPreviewRecording(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Simulated Video Player */}
            <div className="w-full aspect-video bg-black rounded-xl overflow-hidden relative border border-slate-800 flex items-center justify-center group">
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex items-end p-6">
                <div className="flex items-center space-x-4 w-full">
                  <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
                  <div className="flex-1 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-rose-500 h-full w-2/5" />
                  </div>
                  <span className="text-xs text-slate-300 font-mono">14:20 / {previewRecording.duration}</span>
                </div>
              </div>
              
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-full bg-rose-600/90 text-white flex items-center justify-center mx-auto shadow-xl shadow-rose-900/50 cursor-pointer hover:scale-105 transition">
                  <Play className="w-8 h-8 fill-current ml-1" />
                </div>
                <p className="text-xs text-slate-400">Preview simulated for recorded TikTok LIVE stream</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-400 space-x-3">
                <span>Size: <strong className="text-white">{previewRecording.size}</strong></span>
                <span>Resolution: <strong className="text-white">{previewRecording.resolution}</strong></span>
              </div>
              <button
                onClick={() => {
                  showToast(`Downloading ${previewRecording.filename}`);
                  setPreviewRecording(null);
                }}
                className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition shadow-lg shadow-rose-900/30"
              >
                <Download className="w-4 h-4" />
                <span>Download MP4</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
