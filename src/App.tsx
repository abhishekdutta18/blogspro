 
import { useEffect, useState, useRef } from 'react'
import { Play, Pause, Plus, Download, HardDrive, Settings, Activity, FolderOpen, Copy, Terminal, ArrowDown, ArrowUp, Trash2, Ban, MonitorPlay, Link, Square, UploadCloud, ListOrdered, Search, BarChart2, PlayCircle } from 'lucide-react'
import './App.css'
import { Settings as SettingsComponent } from './components/Settings'
import { VideoPlayer } from './components/VideoPlayer'

interface TorrentFile {
  name: string
  length: number
  downloaded: number
  progress: number
  skipped: boolean
  pieceMap?: number[]
  path?: string
}

interface Torrent {
  infoHash: string
  name: string
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  numPeers: number
  timeRemaining: number
  paused: boolean
  done: boolean
  path?: string
  magnetURI?: string
  uploaded: number
  downloaded: number
  ratio: number
  length: number
  announce: string[]
  created?: string | Date
  createdBy?: string
  comment?: string
  files: TorrentFile[]
}

function formatBytes(bytes: number, decimals = 2) {
  if (!bytes || bytes <= 0 || !isFinite(bytes)) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i < 0 || i >= sizes.length) return '0 Bytes'
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function formatTime(ms: number) {
  if (ms === Infinity || isNaN(ms) || ms <= 0) return 'Calculating...'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

const PieceMap = ({ pieces }: { pieces?: number[] }) => {
  if (!pieces || pieces.length === 0) return null;
  
  return (
    <div className="flex w-full h-1.5 bg-gray-900 rounded overflow-hidden mt-1 border border-gray-800" title="Pieces downloaded">
      {pieces.map((ratio, idx) => (
        <div 
          key={idx} 
          className="h-full flex-1" 
          style={{ 
            backgroundColor: ratio === 0 ? 'transparent' : `rgba(59, 130, 246, ${Math.max(0.2, ratio)})` 
          }} 
        />
      ))}
    </div>
  )
}

function App() {
  const [torrents, setTorrents] = useState<Torrent[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [magnetLink, setMagnetLink] = useState('')
  const [customSavePath, setCustomSavePath] = useState('')
  const [error, setError] = useState('')
  type Tab = 'downloading' | 'completed' | 'search' | 'stats' | 'settings'
  const [activeTab, setActiveTab] = useState<Tab>('downloading')
  const [expandedHash, setExpandedHash] = useState<string | null>(null)
  const [activeStreamUrl, setActiveStreamUrl] = useState<string | null>(null)
  const [clipboardMagnet, setClipboardMagnet] = useState<string | null>(null)
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const expandedHashRef = useRef<string | null>(null)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'progress' | 'speed' | 'added'>('added')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [filterText, setFilterText] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  // Speed history for chart (last 60 seconds)
  const [speedHistory, setSpeedHistory] = useState<{down: number, up: number, time: number}[]>([])

  useEffect(() => {
    expandedHashRef.current = expandedHash
  }, [expandedHash])
  

  useEffect(() => {
    // Poll for torrents status every second
    const interval = setInterval(async () => {
      try {
        if (window.torrentApi) {
          const status = await window.torrentApi.getTorrentsStatus(expandedHashRef.current || undefined)
          setTorrents(status as unknown as Torrent[])
          
          let totalDown = 0
          let totalUp = 0
          for (const t of (status as unknown as Torrent[])) {
            totalDown += (t.downloadSpeed || 0)
            totalUp += (t.uploadSpeed || 0)
          }
          setSpeedHistory(prev => {
            const now = Date.now()
            const updated = [...prev, { down: totalDown, up: totalUp, time: now }]
            if (updated.length > 60) updated.shift()
            return updated
          })
        }
      } catch (err) {
        console.error("Failed to fetch torrents", err)
      }
    }, 1000)

    let cleanupClipboard: (() => void) | undefined
    if (window.torrentApi && window.torrentApi.onClipboardMagnet) {
      cleanupClipboard = window.torrentApi.onClipboardMagnet((magnet) => {
        setClipboardMagnet(magnet)
        if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current)
        // Auto-dismiss the toast after 10 seconds
        clipboardTimerRef.current = setTimeout(() => {
          setClipboardMagnet(null)
        }, 10000)
      })
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      
      const files = e.dataTransfer?.files
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i] as File & { path?: string }
          if (file.name.endsWith('.torrent') && file.path) {
            try {
              if (window.torrentApi) {
                await window.torrentApi.addTorrent(file.path)
              }
            } catch (err) {
              console.error('Failed to add dropped torrent:', err)
            }
          }
        }
      }
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)

    return () => {
      clearInterval(interval)
      if (cleanupClipboard) cleanupClipboard()
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  const handleAddTorrent = async (e?: React.FormEvent) => {
    e?.preventDefault()
    
    const target = magnetLink.trim()
    
    if (!target) {
      return
    }

    // Basic validation for magnet links or HTTP(S) torrent URLs
    if (!target.startsWith('magnet:?') && !target.startsWith('http://') && !target.startsWith('https://')) {
      setError('Please enter a valid magnet link (starts with magnet:?) or .torrent URL')
      return
    }

    try {
      setError('')
      if (window.torrentApi) {
        const res = await window.torrentApi.addTorrent(target, customSavePath || undefined)
        if (res && res.infoHash) {
          const existing = torrents.find(t => t.infoHash === res.infoHash)
          if (existing && existing.done) {
            setActiveTab('completed')
            setExpandedHash(res.infoHash)
          } else {
            setActiveTab('downloading')
            setExpandedHash(res.infoHash)
          }
        }
      }
      setMagnetLink('')
      setShowAddModal(false)
    } catch (err: unknown) {
      console.error('Error adding torrent in renderer:', err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const downloadingCount = torrents.filter(t => !t.done).length
  const completedCount = torrents.filter(t => t.done).length

  const displayedTorrents = torrents.filter(t => {
    if (activeTab === 'downloading') return !t.done
    if (activeTab === 'completed') return t.done
    return true
  }).filter(t => {
    if (!filterText) return true
    return (t.name || '').toLowerCase().includes(filterText.toLowerCase())
  }).sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') cmp = (a.name || '').localeCompare(b.name || '');
    else if (sortBy === 'size') cmp = a.length - b.length;
    else if (sortBy === 'progress') cmp = a.progress - b.progress;
    else if (sortBy === 'speed') cmp = (a.downloadSpeed + a.uploadSpeed) - (b.downloadSpeed + b.uploadSpeed);
    // 'added' can just use the original order or 'created' field if available
    else if (sortBy === 'added') {
        const dateA = a.created ? new Date(a.created).getTime() : 0;
        const dateB = b.created ? new Date(b.created).getTime() : 0;
        cmp = dateA - dateB;
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  })

  const handlePauseAll = () => {
    if (window.torrentApi) {
      displayedTorrents.forEach(t => {
        if (!t.paused) window.torrentApi.pauseTorrent(t.infoHash).catch(console.error)
      })
    }
  }

  const handleResumeAll = () => {
    if (window.torrentApi) {
      displayedTorrents.forEach(t => {
        if (t.paused) window.torrentApi.resumeTorrent(t.infoHash).catch(console.error)
      })
    }
  }

  const handleRemove = async (infoHash: string, name: string) => {
    if (window.torrentApi) {
      const confirmed = await window.torrentApi.showConfirmDialog(
        'Delete Torrent',
        `Delete "${name}"? This will delete the torrent from the app (downloaded files will remain on your disk).`
      )
      if (!confirmed) return
      try {
        await window.torrentApi.removeTorrent(infoHash)
      } catch (err) {
        console.error('Failed to remove torrent:', err)
      }
    }
  }

  const handleOpenAddModal = () => {
    setError('')
    setMagnetLink('')
    setShowAddModal(true)
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setIsSearching(true)
    setSearchError('')
    setSearchResults([])
    try {
      if (window.torrentApi) {
        const results = await window.torrentApi.searchTorrents(searchQuery.trim())
        if (results.error) throw new Error(results.error)
        setSearchResults(results)
        setHasSearched(true)
      }
    } catch (err: any) {
      setSearchError(String(err.name) + ': ' + String(err.message) + '\n' + String(err.stack))
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="pt-10 pb-4 px-4 border-b border-gray-700 flex items-center space-x-2 [-webkit-app-region:drag]">
          <Activity className="text-blue-500" size={24} />
          <h1 className="text-xl font-bold tracking-tight">Torrent Downloader</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => { setActiveTab('downloading'); setExpandedHash(null); }}
            className={`flex items-center justify-between w-full p-2 rounded-lg transition-colors ${activeTab === 'downloading' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-gray-700/50 text-gray-400'}`}
          >
            <div className="flex items-center space-x-3">
              <Download size={20} />
              <span className="font-medium">Downloading</span>
            </div>
            {downloadingCount > 0 && (
              <span className="text-xs bg-blue-500/20 text-blue-300 font-semibold px-2 py-0.5 rounded-full">{downloadingCount}</span>
            )}
          </button>
          <button 
            onClick={() => { setActiveTab('completed'); setExpandedHash(null); }}
            className={`flex items-center justify-between w-full p-2 rounded-lg transition-colors ${activeTab === 'completed' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-gray-700/50 text-gray-400'}`}
          >
            <div className="flex items-center space-x-3">
              <HardDrive size={20} />
              <span className="font-medium">Completed</span>
            </div>
            {completedCount > 0 && (
              <span className="text-xs bg-green-500/20 text-green-300 font-semibold px-2 py-0.5 rounded-full">{completedCount}</span>
            )}
          </button>
          <button 
            onClick={() => { setActiveTab('search'); setExpandedHash(null); }}
            className={`flex items-center space-x-3 w-full p-2 rounded-lg transition-colors ${activeTab === 'search' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-gray-700/50 text-gray-400'}`}
          >
            <Search size={20} />
            <span className="font-medium">Search</span>
          </button>
          <button 
            onClick={() => { setActiveTab('stats'); setExpandedHash(null); }}
            className={`flex items-center space-x-3 w-full p-2 rounded-lg transition-colors ${activeTab === 'stats' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-gray-700/50 text-gray-400'}`}
          >
            <BarChart2 size={20} />
            <span className="font-medium">Statistics</span>
          </button>
          <button 
            onClick={() => { setActiveTab('settings'); setExpandedHash(null); }}
            className={`flex items-center space-x-3 w-full p-2 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-gray-700/50 text-gray-400'}`}
          >
            <Settings size={20} />
            <span className="font-medium">Settings</span>
          </button>
          {import.meta && (import.meta as any).env && (import.meta as any).env.DEV && (
            <button 
              onClick={() => window.torrentApi?.toggleDevTools?.()}
              className="flex items-center space-x-3 w-full p-2 rounded-lg transition-colors hover:bg-gray-700/50 text-gray-400"
            >
              <Terminal size={20} />
              <span className="font-medium">DevTools</span>
            </button>
          )}
        </nav>

        <div className="p-4">
          <button 
            onClick={handleOpenAddModal}
            className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95"
          >
            <Plus size={20} />
            <span className="font-semibold">Add Torrent</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm flex items-center justify-between px-6 [-webkit-app-region:drag]">
          <h2 className="text-lg font-semibold text-gray-200 capitalize">{activeTab}</h2>
          <div className="flex items-center space-x-4">
            {displayedTorrents.length > 0 && activeTab === 'downloading' && (
              <div className="flex space-x-2 mr-4 border-r border-gray-700 pr-4 [-webkit-app-region:no-drag]">
                <button 
                  onClick={handlePauseAll}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg flex items-center transition-colors"
                >
                  <Pause size={14} className="mr-1.5" /> Pause All
                </button>
                <button 
                  onClick={handleResumeAll}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg flex items-center transition-colors"
                >
                  <Play size={14} className="mr-1.5" /> Resume All
                </button>
              </div>
            )}
            <div className="text-sm text-gray-400">
              {displayedTorrents.length} active transfer(s)
            </div>
          </div>
        </header>
        { (activeTab === 'downloading' || activeTab === 'completed') && (
        <div className="px-6 pt-4 flex space-x-4 items-center">
            <input 
              type="text" 
              placeholder="Filter torrents..." 
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 w-64"
            />
            <div className="flex items-center space-x-2 text-sm">
                <span className="text-gray-400">Sort:</span>
                <select 
                  value={sortBy} 
                  onChange={e => setSortBy(e.target.value as any)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-gray-200 focus:outline-none focus:border-blue-500"
                >
                    <option value="added">Date Added</option>
                    <option value="name">Name</option>
                    <option value="size">Size</option>
                    <option value="progress">Progress</option>
                    <option value="speed">Speed</option>
                </select>
                <button 
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700"
                >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
            </div>
        </div>
        )}
        <main className="flex-1 overflow-auto p-6 space-y-4">
          {activeTab === 'search' ? (
            <div className="max-w-4xl mx-auto h-full flex flex-col">
              <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search for torrents..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-5 py-3 text-gray-100 focus:outline-none focus:border-blue-500 shadow-sm"
                />
                <button 
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors shadow-sm"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </form>
              
              {searchError && <div className="text-red-400 p-4 bg-red-400/10 rounded-lg">{searchError}</div>}
              
              <div className="flex-1 overflow-auto space-y-3 custom-scrollbar pr-2">
                {searchResults.map((res: any, idx) => (
                  <div key={idx} className="bg-gray-800 p-4 rounded-xl border border-gray-700/50 flex flex-col gap-2 hover:border-gray-600 transition-colors">
                    <h3 className="font-semibold text-gray-200 break-words">{res.name}</h3>
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex gap-4 text-gray-400">
                        <span className="text-green-400">↑ {res.seeders}</span>
                        <span className="text-red-400">↓ {res.leechers}</span>
                        <span>{formatBytes(res.size)}</span>
                      </div>
                      <button 
                        onClick={async () => {
                          if (window.torrentApi) {
                            try {
                              await window.torrentApi.addTorrent(res.magnet)
                              setActiveTab('downloading')
                            } catch (e: any) {
                              setSearchError(e.message)
                            }
                          }
                        }}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-blue-600 text-gray-200 hover:text-white rounded-lg transition-colors text-xs font-medium"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ))}
                {!isSearching && searchResults.length === 0 && hasSearched && !searchError && (
                  <div className="text-center text-gray-500 mt-10">No results found for "{searchQuery}"</div>
                )}
              </div>
            </div>
          ) : activeTab === 'stats' ? (
            <div className="max-w-4xl mx-auto h-full flex flex-col space-y-6">
              <h2 className="text-2xl font-bold text-gray-100">Global Bandwidth Statistics</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700/50 shadow-sm flex flex-col items-center">
                  <span className="text-gray-400 mb-2">Current Download</span>
                  <span className="text-3xl font-bold text-green-400">
                    {formatBytes(speedHistory.length > 0 ? speedHistory[speedHistory.length - 1].down : 0)}/s
                  </span>
                </div>
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700/50 shadow-sm flex flex-col items-center">
                  <span className="text-gray-400 mb-2">Current Upload</span>
                  <span className="text-3xl font-bold text-red-400">
                    {formatBytes(speedHistory.length > 0 ? speedHistory[speedHistory.length - 1].up : 0)}/s
                  </span>
                </div>
              </div>

              <div className="bg-gray-800 p-6 rounded-xl border border-gray-700/50 shadow-sm flex-1 flex flex-col">
                <h3 className="text-lg font-medium text-gray-200 mb-4">Bandwidth History (Last 60s)</h3>
                <div className="flex-1 relative w-full h-full min-h-[300px]">
                  <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="downGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4ade80" stopOpacity="0.2"/>
                        <stop offset="100%" stopColor="#4ade80" stopOpacity="0"/>
                      </linearGradient>
                      <linearGradient id="upGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f87171" stopOpacity="0.2"/>
                        <stop offset="100%" stopColor="#f87171" stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    
                    {(() => {
                      if (speedHistory.length < 2) return null;
                      
                      let maxSpeed = 1024 * 1024; // 1MB/s minimum scale
                      speedHistory.forEach(s => {
                        if (s.down > maxSpeed) maxSpeed = s.down;
                        if (s.up > maxSpeed) maxSpeed = s.up;
                      });
                      // add 10% headroom
                      maxSpeed *= 1.1;

                      const width = 100;
                      const height = 100;

                      const getPoints = (type: 'down' | 'up') => {
                        return speedHistory.map((s, i) => {
                          const x = (i / (Math.max(60, speedHistory.length) - 1)) * width;
                          const y = height - (s[type] / maxSpeed) * height;
                          return `${x}%,${y}%`;
                        }).join(' ');
                      };

                      const downPoints = getPoints('down');
                      const upPoints = getPoints('up');

                      const lastX = speedHistory.length > 0 ? ((speedHistory.length - 1) / (Math.max(60, speedHistory.length) - 1)) * width : 0;
                      return (
                        <>
                          <polygon points={`0%,100% ${downPoints} ${lastX}%,100%`} fill="url(#downGrad)" />
                          <polygon points={`0%,100% ${upPoints} ${lastX}%,100%`} fill="url(#upGrad)" />
                          
                          <polyline points={downPoints} fill="none" stroke="#4ade80" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                          <polyline points={upPoints} fill="none" stroke="#f87171" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                        </>
                      );
                    })()}
                  </svg>
                  <div className="absolute top-0 right-0 text-xs text-gray-500 bg-gray-900/80 px-2 py-1 rounded">
                    Y-Axis scales dynamically
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'settings' ? (
            <SettingsComponent />
          ) : displayedTorrents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
              <Download size={48} className="opacity-20" />
              <p className="text-lg">No torrents found</p>
            </div>
          ) : (
            displayedTorrents.map((t) => (
              <div 
                key={t.infoHash} 
                className={`bg-gray-800 rounded-xl p-5 border shadow-sm transition-colors group cursor-pointer ${expandedHash === t.infoHash ? 'border-gray-500 bg-gray-750' : 'border-gray-700/50 hover:border-gray-600'}`}
                onClick={() => setExpandedHash(expandedHash === t.infoHash ? null : t.infoHash)}
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold text-gray-100 truncate pr-4">{t.name || 'Fetching metadata...'}</h3>
                  <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    {t.paused ? (
                      <button 
                        className={`p-2 rounded-lg text-white flex items-center transition-colors ${t.done ? 'bg-blue-600 hover:bg-blue-500' : 'bg-green-600 hover:bg-green-500'}`}
                        title={t.done ? "Start Seeding" : "Resume Download"}
                        onClick={() => window.torrentApi.resumeTorrent(t.infoHash)}
                      >
                        {t.done ? <UploadCloud size={14} /> : <Play size={14} className="fill-current" />}
                        <span className="ml-2 text-xs font-medium uppercase tracking-wider">{t.done ? 'Seed' : 'Resume'}</span>
                      </button>
                    ) : (
                      <button 
                        className={`p-2 rounded-lg text-white flex items-center transition-colors ${t.done ? 'bg-red-600 hover:bg-red-500' : 'bg-yellow-600 hover:bg-yellow-500'}`}
                        title={t.done ? "Stop Seeding (Sever Connections)" : "Pause Download"}
                        onClick={() => window.torrentApi.pauseTorrent(t.infoHash)}
                      >
                        {t.done ? <Square size={14} className="fill-current" /> : <Pause size={14} className="fill-current" />}
                        <span className="ml-2 text-xs font-medium uppercase tracking-wider">{t.done ? 'Stop' : 'Pause'}</span>
                      </button>
                    )}
                    {t.magnetURI && (
                      <button 
                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300" 
                        title="Copy Magnet Link"
                        onClick={() => window.torrentApi.copyToClipboard(t.magnetURI!)}
                      >
                        <Copy size={16} />
                      </button>
                    )}
                    {!t.done && (
                      <button
                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300"
                        title="Download Sequentially"
                        onClick={() => {
                          if (window.torrentApi) {
                            window.torrentApi.setSequential(t.infoHash, true)
                          }
                        }}
                      >
                        <ListOrdered size={16} />
                      </button>
                    )}
                    {t.path && (
                      <button 
                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300" 
                        title="Open Folder"
                        onClick={() => {
                          const isSingleFile = t.files && t.files.length === 1
                          
                          
                          fetch((window.location.port === '5173' ? 'http://localhost:8080' : '') + '/api/torrents/' + t.infoHash + '/open_folder', { method: 'POST' })
                        }}
                      >
                        <FolderOpen size={16} />
                      </button>
                    )}
                    <button 
                      className="p-2 bg-gray-700 hover:bg-red-600 rounded-lg text-gray-300 hover:text-white"
                      title="Remove from list (Downloads remain on disk)"
                      onClick={() => handleRemove(t.infoHash, t.name)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>{(t.progress * 100).toFixed(1)}% • {formatBytes(t.downloaded)} / {formatBytes(t.length)}</span>
                    <div className="flex items-center space-x-3">
                      <span className="flex items-center"><ArrowDown size={12} className="mr-1 text-green-400" />{formatBytes(t.downloadSpeed)}/s</span>
                      <span className="flex items-center"><ArrowUp size={12} className="mr-1 text-blue-400" />{formatBytes(t.uploadSpeed)}/s</span>
                    </div>
                  </div>
                  
                  <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(t.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Download progress: ${Math.round(t.progress * 100)}%`}>
                    <div 
                      className={`h-full bg-blue-500 rounded-full transition-all duration-300 ease-out ${t.done ? 'bg-green-500' : ''}`}
                      style={{ width: `${t.progress * 100}%` }}
                    />
                  </div>
                  
                  <div className="flex justify-between text-xs text-gray-500 pt-1">
                    <span>Seeders / Peers: {t.numPeers}</span>
                    <span>{t.done ? 'Completed' : `ETA: ${formatTime(t.timeRemaining)}`}</span>
                  </div>
                </div>

                {expandedHash === t.infoHash && (
                  <div className="mt-4 pt-4 border-t border-gray-700" onClick={e => e.stopPropagation()}>
                    <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-300">Data Transfer</h4>
                        <div className="bg-gray-900/50 p-3 rounded-lg space-y-1">
                          <div className="flex justify-between"><span className="text-gray-500">Uploaded:</span> <span className="text-gray-300">{formatBytes(t.uploaded)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Downloaded:</span> <span className="text-gray-300">{formatBytes(t.downloaded)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Share Ratio:</span> <span className="text-gray-300">{t.ratio ? t.ratio.toFixed(2) : '0.00'}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Size:</span> <span className="text-gray-300">{formatBytes(t.length)}</span></div>
                        </div>
                        <h4 className="font-semibold text-gray-300 pt-2">Trackers</h4>
                        <div className="bg-gray-900/50 p-3 rounded-lg max-h-32 overflow-y-auto custom-scrollbar text-xs text-gray-400">
                          {t.announce && t.announce.length > 0 ? (
                            <ul className="list-disc pl-4 space-y-1">
                              {t.announce.map((url, i) => <li key={i} className="break-all">{url}</li>)}
                            </ul>
                          ) : (
                            <span className="italic">No trackers (DHT/PEX only)</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-300">Information</h4>
                        <div className="bg-gray-900/50 p-3 rounded-lg space-y-1 text-xs break-all">
                          <div className="text-gray-500 font-semibold mb-1">InfoHash:</div>
                          <div className="text-gray-300 bg-gray-800 p-1.5 rounded">{t.infoHash}</div>
                          {t.path && (
                            <div className="mt-3">
                              <div className="text-gray-500 font-semibold mb-1">Save Path:</div>
                              <div className="text-gray-300 bg-gray-800 p-1.5 rounded">{t.path}</div>
                            </div>
                          )}
                          {t.created && (
                            <div className="flex justify-between mt-3 pt-2 border-t border-gray-700/50">
                              <span className="text-gray-500">Created:</span> 
                              <span className="text-gray-300">{new Date(t.created).toLocaleDateString()}</span>
                            </div>
                          )}
                          {t.createdBy && (
                            <div className="flex justify-between pt-1">
                              <span className="text-gray-500">Created By:</span> 
                              <span className="text-gray-300">{t.createdBy}</span>
                            </div>
                          )}
                          {t.comment && (
                            <div className="pt-2">
                              <span className="text-gray-500">Comment:</span> 
                              <p className="text-gray-300 mt-1 italic">{t.comment}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {t.files && t.files.length > 0 && (
                      <div className="pt-2">
                        <h4 className="text-sm font-semibold text-gray-300 mb-2">Files</h4>
                        <ul className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar list-none">
                          {t.files.map((f: any, i: number) => (
                            <li key={i} className={`flex justify-between items-center bg-gray-900/50 p-2 rounded border border-gray-700/50 ${f.skipped ? 'opacity-50 grayscale' : ''}`}>
                              <div className="flex flex-col overflow-hidden flex-1 pr-4">
                                <span className={`truncate ${f.skipped ? 'line-through text-gray-500' : ''}`} title={f.name}>{f.name}</span>
                                <span className="text-xs text-gray-500">
                                  {(f.length / 1024 / 1024).toFixed(2)} MB • {Math.round(f.progress * 100)}% {f.skipped ? '(Skipped)' : ''}
                                </span>
                                <PieceMap pieces={f.pieceMap} />
                              </div>
                              <div className="flex gap-2 flex-shrink-0">
                                {f.skipped ? (
                                  <button
                                    onClick={async () => {
                                      if (window.torrentApi) {
                                        await window.torrentApi.prioritizeFile(t.infoHash, i)
                                      }
                                    }}
                                    title="Resume Download"
                                    className="p-1 hover:text-green-400 hover:bg-gray-800 rounded transition-colors"
                                  >
                                    <ArrowUp size={14} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      if (window.torrentApi) {
                                        await window.torrentApi.skipFile(t.infoHash, i)
                                      }
                                    }}
                                    title="Skip/Do Not Download"
                                    className="p-1 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
                                  >
                                    <Ban size={14} />
                                  </button>
                                )}
                                  {/* Stream in App button */}
                                  <button
                                    onClick={async () => {
                                      if (window.torrentApi) {
                                        try {
                                          const url = await window.torrentApi.startStream(t.infoHash, i)
                                          setActiveStreamUrl(url)
                                        } catch (err: any) {
                                          alert('Failed to start stream: ' + err.message)
                                        }
                                      }
                                    }}
                                    title="Play In App"
                                    className="p-1 hover:text-green-400 hover:bg-gray-800 rounded transition-colors"
                                  >
                                    <PlayCircle size={14} />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (window.torrentApi) {
                                        try {
                                          await window.torrentApi.playExternal(t.infoHash, i)
                                        } catch (err: any) {
                                          alert('Failed to play in external app. You may need to configure your Media Player path in Settings.\n\nError: ' + err.message)
                                        }
                                      }
                                    }}
                                    title="Play in External App (VLC, IINA, etc.)"
                                    className="p-1 hover:text-orange-400 hover:bg-gray-800 rounded transition-colors"
                                  >
                                    <MonitorPlay size={14} />
                                  </button>
                                <button
                                  onClick={async () => {
                                    if (window.torrentApi) {
                                      try {
                                        const url = await window.torrentApi.startStream(t.infoHash, i)
                                        await window.torrentApi.copyToClipboard(url)
                                      } catch (err: any) {
                                        alert('Failed to copy stream link: ' + err.message)
                                      }
                                    }
                                  }}
                                  title="Copy Stream URL"
                                  className="p-1 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors"
                                >
                                  <Link size={14} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.torrentApi && t.path && f.path) {
                                      // Construct full file path - path joining handled server-side (#13)
                                      fetch((window.location.port === '5173' ? 'http://localhost:8080' : '') + '/api/torrents/' + t.infoHash + '/open_folder', { method: 'POST' })
                                    } else if (window.torrentApi && t.path) {
                                      fetch((window.location.port === '5173' ? 'http://localhost:8080' : '') + '/api/torrents/' + t.infoHash + '/open_folder', { method: 'POST' })
                                    }
                                  }}
                                  title="Show in Finder"
                                  className="p-1 hover:text-yellow-400 hover:bg-gray-800 rounded transition-colors"
                                >
                                  <FolderOpen size={14} />
                                </button>
                              </div>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </main>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-xl font-semibold mb-4 text-gray-100">Add New Torrent</h3>
            <form onSubmit={handleAddTorrent}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Magnet Link or .torrent URL</label>
                  <input 
                    type="text" 
                    value={magnetLink}
                    onChange={(e) => setMagnetLink(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow placeholder-gray-600 mb-3"
                    placeholder="magnet:?xt=urn:btih:... or https://..."
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Save Location (Leave blank for default)</label>
                  <div className="flex space-x-2">
                    <input 
                      type="text" 
                      value={customSavePath}
                      onChange={(e) => setCustomSavePath(e.target.value)}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow placeholder-gray-600"
                      placeholder="e.g. /Users/name/Downloads"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const folder = await window.torrentApi?.selectFolder();
                        if (folder) setCustomSavePath(folder);
                      }}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-200 transition-colors"
                    >
                      Browse...
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Or select a .torrent file</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.torrentApi) {
                          const path = await window.torrentApi.openTorrentDialog()
                          if (path) {
                            try {
                              if (path !== 'torrent-added-via-file') await window.torrentApi.addTorrent(path, customSavePath || undefined)
                              setShowAddModal(false)
                            } catch (err: any) {
                              setError(err.message || String(err))
                            }
                          }
                        }
                      }}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors font-medium text-sm"
                    >
                      Browse...
                    </button>
                    <span className="text-sm text-gray-500 py-2">
                      (You can also drag & drop .torrent files anywhere)
                    </span>
                  </div>
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="flex justify-end space-x-3 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setShowAddModal(false)}
                    className="px-5 py-2.5 text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={!magnetLink}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-xl transition-colors font-medium shadow-lg shadow-blue-500/20"
                  >
                    Download
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clipboard Magnet Toast */}
      {clipboardMagnet && (
        <div className="fixed bottom-6 right-6 bg-gray-800 border border-blue-500/30 rounded-xl p-4 shadow-2xl flex items-start space-x-4 max-w-sm animate-fade-in-up z-50">
          <div className="text-2xl mt-1">🧲</div>
          <div className="flex-1">
            <h4 className="text-gray-100 font-medium mb-1 text-sm">Magnet link detected</h4>
            <p className="text-gray-400 text-xs truncate w-64 mb-3" title={clipboardMagnet}>{clipboardMagnet}</p>
            <div className="flex space-x-2">
              <button 
                onClick={() => {
                  setMagnetLink(clipboardMagnet)
                  setShowAddModal(true)
                  setClipboardMagnet(null)
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Add Torrent
              </button>
              <button 
                onClick={() => setClipboardMagnet(null)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs font-medium transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {activeStreamUrl && (
        <VideoPlayer 
          streamUrl={activeStreamUrl} 
          onClose={() => setActiveStreamUrl(null)} 
        />
      )}
    </div>
  )
}

export default App
