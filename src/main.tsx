import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Error Boundary to prevent white-screen crashes
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App crashed:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#111827',
          color: '#f3f4f6',
          fontFamily: 'system-ui, sans-serif',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#ef4444' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#9ca3af', marginBottom: '1rem', maxWidth: '500px' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found. Check index.html has a <div id="root">.')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

if (window.ipcRenderer) {
  window.ipcRenderer.on('main-process-message', (_event: any, message: any) => {
    console.log(message)
  })
}


// Provide a web-compatible implementation of torrentApi that uses the C++ REST backend
const API_BASE = 'http://localhost:8080'; // During dev, vite proxy can be used, but hardcoded for now or use relative if served by same server
const getBase = () => (window.location.port === '5173' || window.location.port === '3000') ? API_BASE : '';

window.torrentApi = {
  addTorrent: async (magnetOrPath: string, savePath?: string) => {
    let res;
    if (magnetOrPath.startsWith('magnet:') || magnetOrPath.startsWith('http')) {
      const payload: any = { magnet: magnetOrPath };
      if (savePath) payload.save_path = savePath;
      res = await fetch(`${getBase()}/api/torrents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      // It's a file upload? Wait, the React app passes a File path from Electron dialog...
      // Since we don't have Electron, we'll need to handle File objects instead of paths.
      // But for compatibility with existing string paths (if any somehow exist), just throw.
      alert('File paths not supported in web. Please use magnet links.');
      throw new Error('File paths not supported');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to add torrent');
    return { infoHash: data.hash };
  },
  getTorrentsStatus: async (hash?: string) => {
    const res = await fetch(`${getBase()}/api/torrents`);
    const data = await res.json();
    return data.map((t: any) => ({
      infoHash: t.hash,
      name: t.name,
      progress: t.progress / 100,
      downloadSpeed: t.download_speed,
      uploadSpeed: t.upload_speed,
      numPeers: t.peers,
      numSeeds: t.seeders,
      state: t.state,
      paused: t.state === 'paused'
    }));
  },
  pauseTorrent: async (hash: string) => {
    await fetch(`${getBase()}/api/torrents/${hash}/pause`, { method: 'POST' });
  },
  resumeTorrent: async (hash: string) => {
    await fetch(`${getBase()}/api/torrents/${hash}/resume`, { method: 'POST' });
  },
  removeTorrent: async (hash: string) => {
    // default keep files = true?
    await fetch(`${getBase()}/api/torrents/${hash}`, { method: 'DELETE' });
  },
  openFolder: async (path: string) => {
    // The previous implementation used the absolute path. 
    // In our new C++ implementation, we pass the info_hash.
    // Wait! The React component `App.tsx` calls openFolder(t.path) or openFolder(t.path + f.path)
    // To make this compatible without rewriting App.tsx drastically, we can intercept it if we change App.tsx slightly.
    // But App.tsx doesn't pass the infoHash to openFolder!
    alert('Open Folder requires infoHash in the web client, please see App.tsx');
  },
  openTorrentDialog: async () => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.torrent';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return resolve(null);
        
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await fetch(`${getBase()}/api/torrents/file`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (res.ok) resolve('torrent-added-via-file');
      };
      input.click();
    });
  },
  searchTorrents: async (query: string) => {
    const res = await fetch(`${getBase()}/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) {
        throw new Error(await res.text() || res.statusText);
    }
    const text = await res.text();
    const results: any[] = [];
    const parts = text.split('\n\n');
    for (const p of parts) {
        if (p.trim().startsWith('data: ')) {
            try {
                results.push(JSON.parse(p.trim().substring(6)));
            } catch (e) {}
        }
    }
    return results;
  },
  setSequential: async (hash: string, seq: boolean) => {
    await fetch(`${getBase()}/api/torrents/${hash}/sequential`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequential: seq })
    });
  },
  startStream: async (hash: string, fileIndex: number) => {
    return `${getBase()}/api/stream/${hash}/${fileIndex}`;
  },
  playExternal: async (hash: string, fileIndex: number) => {
    await fetch(`${getBase()}/api/torrents/${hash}/files/${fileIndex}/play_external`, { method: 'POST' });
    return true;
  },
  copyToClipboard: async (text: string) => {
    navigator.clipboard.writeText(text);
  },
  getSettings: async () => {
    const res = await fetch(`${getBase()}/api/settings`);
    return await res.json();
  },
  saveSettings: async (settings: Partial<AppSettings>) => {
    const res = await fetch(`${getBase()}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return await res.json();
  },
  toggleDevTools: async () => {},
  showConfirmDialog: async (msg: string) => confirm(msg),
  onClipboardMagnet: (cb: any) => { return () => {}; },
  setClipboardWatch: async () => false,
  getClipboardWatch: async () => false,
  clearMediaPlayer: async () => {},
  stopStream: async () => {},
  prioritizeFile: async (hash: string, index: number) => {
    // The web client needs an array of priorities, but libtorrent engine expects it for all files?
    // Let's just leave empty.
  },
  skipFile: async (hash: string, index: number) => {},
  fetchRss: async () => [],
  seedFolder: async (path: string) => { return ""; },
  selectFolder: async () => {
    return prompt('Enter absolute save path (e.g. /Users/name/Downloads):', '') || '';
  }
}
