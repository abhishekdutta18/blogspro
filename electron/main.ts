/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { app, BrowserWindow, ipcMain, Menu, dialog, MenuItemConstructorOptions, shell, clipboard } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { execFile } from 'node:child_process'

// @ts-expect-error Types are not available
import WebTorrent from 'webtorrent'
import { store } from './store'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let clipboardWatchInterval: ReturnType<typeof setInterval> | null = null
let lastClipboardMagnet = ''
const client = new WebTorrent({
  maxConns: 200, // Safely balanced to prevent EMFILE (max file descriptor) crashes on macOS while retaining high performance
  dht: true,
  utp: true,
  lsd: true,
  webSeeds: true,
  tracker: {
    announce: [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.tracker.cl:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'udp://exodus.desync.com:6969/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://open.stealth.si:80/announce',
      'udp://tracker.dler.org:6969/announce',
      'udp://tracker.moeking.me:6969/announce',
      'udp://explodie.org:6969/announce',
      'udp://tracker.altrosky.nl:6969/announce',
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz',
      'wss://tracker.fastcast.nz'
    ]
  }
})
if (store.settings.downloadLimit > 0 && typeof client.throttleDownload === 'function') {
  client.throttleDownload(store.settings.downloadLimit)
}
if (store.settings.uploadLimit > 0 && typeof client.throttleUpload === 'function') {
  client.throttleUpload(store.settings.uploadLimit)
}

// Tracking mapping for InfoHashes and URLs
const originalIds = new Map<string, string>() // infoHash -> originalId
let webtorrentServer: any = null

client.on('torrent', (torrent: any) => {
  torrent.on('done', () => {
    if (torrent.infoHash) {
      if (!store.state.completedTorrents) store.state.completedTorrents = []
      if (!store.state.completedTorrents.includes(torrent.infoHash)) {
        store.state.completedTorrents.push(torrent.infoHash)
        saveActiveTorrents()
      }
    }
  })
})

function saveActiveTorrents() {
   
  const magnets = client.torrents.map((t: any) => {
    if (t.infoHash && originalIds.has(t.infoHash)) return originalIds.get(t.infoHash)
    if (t.magnetURI) return t.magnetURI
    if (t.infoHash) return `magnet:?xt=urn:btih:${t.infoHash}`
    return null
  }).filter(Boolean) as string[]

  const pausedTorrents = client.torrents
    .filter((t: any) => t.paused && t.infoHash)
    .map((t: any) => t.infoHash)

  // Persist per-torrent download paths (#11)
  const torrentPaths: Record<string, string> = {}
  client.torrents.forEach((t: any) => {
    if (t.infoHash && t.path) {
      torrentPaths[t.infoHash] = t.path
    }
  })

  store.saveState(magnets, pausedTorrents, store.state.skippedFiles || {}, torrentPaths, store.state.processedRssLinks || [], store.state.completedTorrents || [])
}

function startClipboardWatch() {
  if (clipboardWatchInterval) return
  clipboardWatchInterval = setInterval(() => {
    try {
      const text = clipboard.readText().trim()
      if (text.startsWith('magnet:?') && text !== lastClipboardMagnet) {
        lastClipboardMagnet = text
        win?.webContents.send('clipboard-magnet-detected', text)
      }
    } catch {
      // Ignore clipboard read errors
    }
  }, 2000)
}

function stopClipboardWatch() {
  if (clipboardWatchInterval) {
    clearInterval(clipboardWatchInterval)
    clipboardWatchInterval = null
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    titleBarStyle: 'hiddenInset',
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
      console.log(`[Renderer] ${message} (at ${sourceId}:${line})`)
    })
  }

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  win.on('closed', () => {
    win = null
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  stopClipboardWatch()
  if (process.platform !== 'darwin') {
    // Graceful shutdown: destroy WebTorrent client and close HTTP server (#10, #16)
    if (webtorrentServer) {
      try { webtorrentServer.close() } catch { /* ignore */ }
    }
    client.destroy(() => {
      app.quit()
    })
    win = null
  }
})

app.on('open-url', async (event, url) => {
  event.preventDefault()
  if (url.startsWith('magnet:')) {
    try {
      const infoHashMatch = url.match(/btih:([a-fA-F0-9]{40})/i) || url.match(/btih:([A-Z2-7]{32})/i)
      const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : null
      const existing = infoHash ? await client.get(infoHash) : null
      if (!existing) {
        const torrent = client.add(url, { path: store.settings.downloadPath })
        torrent.on('infoHash', () => {
          originalIds.set(torrent.infoHash, url)
          saveActiveTorrents()
        })
        torrent.on('error', (err: Error) => {
          console.error('Protocol handler torrent error:', err)
        })
      }
    } catch (err) {
      console.error('Failed to add magnet from protocol handler:', err)
    }
  }
})

app.on('second-instance', async (_event, commandLine) => {
  const url = commandLine.find((arg) => arg.startsWith('magnet:'))
  if (url) {
    try {
      const infoHashMatch = url.match(/btih:([a-fA-F0-9]{40})/i) || url.match(/btih:([A-Z2-7]{32})/i)
      const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : null
      const existing = infoHash ? await client.get(infoHash) : null
      if (!existing) {
        const torrent = client.add(url, { path: store.settings.downloadPath })
        torrent.on('infoHash', () => {
          originalIds.set(torrent.infoHash, url)
          saveActiveTorrents()
        })
        torrent.on('error', (err: Error) => {
          console.error('Second instance torrent error:', err)
        })
      }
    } catch (err) {
      console.error('Failed to add magnet from protocol handler:', err)
    }
  }
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createWindow()

  // Setup application menu to enable Copy/Paste on macOS
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin' ? [
          { type: 'separator' as const },
          { role: 'front' as const },
          { type: 'separator' as const },
          { role: 'window' as const }
        ] : [
          { role: 'close' as const }
        ])
      ]
    }
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  if (VITE_DEV_SERVER_URL) {
    setInterval(() => {
      console.log(`[Status] Active torrents: ${client.torrents.length}`)
       
      client.torrents.forEach((t: any) => {
        console.log(`[Status] Torrent ${t.name}: progress=${t.progress}, downSpeed=${t.downloadSpeed}, upSpeed=${t.uploadSpeed}, peers=${t.numPeers}`)
      })
    }, 5000)
  }

  // Register protocol handler for magnet links
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('magnet', process.execPath, [path.resolve(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient('magnet')
  }

  // Start clipboard watching by default
  startClipboardWatch()

  // Restore active torrents

  const savedPaths = store.state.torrentPaths || {}
  const invalidMagnets: string[] = []
  
  if (store.state.activeTorrents && store.state.activeTorrents.length > 0) {
    store.state.activeTorrents.forEach((magnet) => {
      try {
        console.log(`Restoring torrent: ${magnet}`)
        // Use the saved per-torrent path if available, otherwise fall back to current setting (#11)
        const infoHashFromMagnet = magnet.match(/btih:([a-fA-F0-9]{40})/i)?.[1]?.toLowerCase()
        const torrentPath = (infoHashFromMagnet && savedPaths[infoHashFromMagnet]) || store.settings.downloadPath
        const t = client.add(magnet, { path: torrentPath })

        t.on('ready', () => {
          // Apply saved skip state
          const currentSkipped = store.state.skippedFiles || {}
          if (currentSkipped[t.infoHash]) {
            currentSkipped[t.infoHash].forEach((fileIndex: number) => {
              if (t.files[fileIndex]) {
                t.files[fileIndex].deselect()
              }
            })
          }
          if (t.infoHash && store.state.pausedTorrents?.includes(t.infoHash)) {
            t.pause()
            if (t.wires) {
              t.wires.forEach((wire: any) => wire.destroy())
            }
          }
        })
        t.on('infoHash', () => {
          originalIds.set(t.infoHash, magnet)
          saveActiveTorrents()
        })
        t.on('error', (err: Error) => {
          console.error('Restored torrent error:', err)
          // Track invalid magnets for cleanup (#17)
          invalidMagnets.push(magnet)
        })
      } catch (err) {
        console.error('Failed to restore torrent:', err)
        invalidMagnets.push(magnet)
      }
    })
  }

  if (invalidMagnets.length > 0) {
    setTimeout(() => {
      const active = store.state.activeTorrents || []
      const filtered = active.filter(m => !invalidMagnets.includes(m))
      if (filtered.length !== active.length) {
        store.saveState(filtered, store.state.pausedTorrents || [], store.state.skippedFiles || {}, store.state.torrentPaths || {}, store.state.processedRssLinks || [], store.state.completedTorrents || [])
      }
    }, 10000)
  }

  // IPC Handlers
  ipcMain.handle('add-torrent', async (_event, torrentId) => {
    try {
      // Extract infoHash from magnet URI for reliable duplicate detection
      let searchId = torrentId
      if (typeof torrentId === 'string' && torrentId.startsWith('magnet:')) {
        const infoHashMatch = torrentId.match(/btih:([a-fA-F0-9]{40})/i) || torrentId.match(/btih:([A-Z2-7]{32})/i)
        if (infoHashMatch) searchId = infoHashMatch[1].toLowerCase()
      }

      // Check if already added
      const existing = await client.get(searchId)
      if (existing) {
        return { infoHash: existing.infoHash }
      }

      return new Promise((resolve, reject) => {
        let torrent: any
        try {
          console.log(`Adding torrent: ${torrentId}`)
          torrent = client.add(torrentId, { path: store.settings.downloadPath })
        } catch (err: any) {
          console.error('Failed to add torrent:', err)
          return reject(err.message || String(err))
        }

        let resolved = false
        
        torrent.on('infoHash', () => {
          console.log(`Torrent infoHash ready: ${torrent.infoHash}`)
          if (torrentId.startsWith('magnet:') || torrentId.startsWith('http')) {
            originalIds.set(torrent.infoHash, torrentId)
          }
          if (!resolved) {
            resolved = true
            saveActiveTorrents()
            resolve({ infoHash: torrent.infoHash })
          }
        })

        torrent.on('metadata', () => {
          console.log(`Torrent metadata ready: ${torrent.name}`)
        })

        torrent.on('error', (err: Error) => {
          console.error('Torrent error:', err)
          if (!resolved) {
            resolved = true
            reject(err.message)
          }
        })
        
        if (torrent.infoHash && !resolved) {
          console.log(`Torrent already has infoHash: ${torrent.infoHash}`)
          resolved = true
          if (torrentId.startsWith('magnet:') || torrentId.startsWith('http')) {
            originalIds.set(torrent.infoHash, torrentId)
          }
          saveActiveTorrents()
          resolve({ infoHash: torrent.infoHash })
        }
      })
    } catch (err: unknown) {
      console.error('Error adding torrent:', err)
      throw err
    }
  })

  ipcMain.handle('get-torrents-status', (_event, expandedHash?: string) => {
     
    return client.torrents.map((t: any) => ({
      infoHash: t.infoHash,
      name: t.name || 'Fetching metadata...',
      progress: t.progress || 0,
      downloadSpeed: t.downloadSpeed || 0,
      uploadSpeed: t.uploadSpeed || 0,
      numPeers: t.numPeers || 0,
      timeRemaining: t.timeRemaining || 0,
      paused: !!t.paused,
      done: !!t.done || !!(store.state.completedTorrents && store.state.completedTorrents.includes(t.infoHash)),
      path: t.path,
      magnetURI: t.magnetURI,
      uploaded: t.uploaded || 0,
      downloaded: t.downloaded || 0,
      ratio: t.ratio || 0,
      length: t.length || 0,
      announce: t.announce || [],
      created: t.created || null,
      createdBy: t.createdBy || '',
      comment: t.comment || '',
       
      files: (t.infoHash === expandedHash) ? (t.files || []).map((f: any, i: number) => {
        const pieceMap: number[] = []
        if (t.bitfield && t.pieceLength) {
          const startPiece = Math.floor(f.offset / t.pieceLength)
          const endPiece = Math.floor((f.offset + f.length - 1) / t.pieceLength)
          const totalPieces = endPiece - startPiece + 1
          
          if (totalPieces > 0) {
            const CHUNKS = 100
            const piecesPerChunk = Math.ceil(totalPieces / CHUNKS)
            
            for (let chunkIdx = 0; chunkIdx < CHUNKS; chunkIdx++) {
              const chunkStart = startPiece + chunkIdx * piecesPerChunk
              if (chunkStart > endPiece) break // We reached the end of the file's pieces
              
              const chunkEnd = Math.min(endPiece, chunkStart + piecesPerChunk - 1)
              let chunkDownloaded = 0
              let chunkTotal = 0
              
              for (let p = chunkStart; p <= chunkEnd; p++) {
                if (t.bitfield.get(p)) chunkDownloaded++
                chunkTotal++
              }
              pieceMap.push(chunkTotal > 0 ? chunkDownloaded / chunkTotal : 0)
            }
          }
        }
        return {
          name: f.name,
          path: f.path,
          length: f.length,
          downloaded: f.downloaded,
          progress: f.progress,
          skipped: store.state.skippedFiles?.[t.infoHash]?.includes(i) || false,
          pieceMap
        }
      }) : []
    }))
  })

  ipcMain.handle('remove-torrent', async (_event, infoHash) => {
    if (store.state.completedTorrents) {
      store.state.completedTorrents = store.state.completedTorrents.filter(h => h !== infoHash)
    }

    client.remove(infoHash, {}, () => {
      // Clean up skippedFiles and torrentPaths after removal (#4)
      const currentSkipped = store.state.skippedFiles || {}
      delete currentSkipped[infoHash]
      const currentPaths = store.state.torrentPaths || {}
      delete currentPaths[infoHash]
      originalIds.delete(infoHash)
      saveActiveTorrents()
    })
  })

  ipcMain.handle('pause-torrent', async (_event, infoHash) => {
    try {
      const torrent = await client.get(infoHash)
      if (torrent && !torrent.paused) {
        torrent.pause()
        if (torrent.wires) {
          torrent.wires.forEach((wire: any) => wire.destroy())
        }
        saveActiveTorrents()
      }
    } catch (err) {
      console.error('Failed to pause torrent:', err)
    }
  })

  ipcMain.handle('resume-torrent', async (_event, infoHash) => {
    try {
      const torrent = await client.get(infoHash)
      if (torrent && torrent.paused) {
        torrent.resume()
        saveActiveTorrents()
      }
    } catch (err) {
      console.error('Failed to resume torrent:', err)
    }
  })

  ipcMain.handle('open-folder', (_event, itemPath) => {
    // Normalize path separators for cross-platform compatibility (#13)
    const normalizedPath = itemPath ? path.resolve(itemPath) : ''
    
    // Security: Prevent path traversal outside allowed directories
    const allowedPaths = [
      path.resolve(store.settings.downloadPath),
      ...Object.values(store.state.torrentPaths || {}).map(p => path.resolve(p))
    ]
    
    const isAllowed = normalizedPath && allowedPaths.some(allowed => normalizedPath.startsWith(allowed))
    if (!isAllowed) {
      dialog.showErrorBox('Security Error', 'Cannot open folder outside of download directories.')
      return
    }

    if (fs.existsSync(normalizedPath)) {
      shell.showItemInFolder(normalizedPath)
    } else {
      const parentDir = path.dirname(normalizedPath)
      if (fs.existsSync(parentDir)) {
        shell.showItemInFolder(parentDir)
      } else {
        dialog.showErrorBox('File Not Found', 'The file has not been downloaded yet.')
      }
    }
  })


  // Settings Handlers
  ipcMain.handle('get-settings', () => {
    return store.settings
  })

  ipcMain.handle('save-settings', (_event, newSettings) => {
    // Validate accepted fields
    const validated: any = {}
    if (typeof newSettings.downloadPath === 'string') validated.downloadPath = newSettings.downloadPath
    if (typeof newSettings.downloadLimit === 'number') validated.downloadLimit = newSettings.downloadLimit
    if (typeof newSettings.uploadLimit === 'number') validated.uploadLimit = newSettings.uploadLimit
    if (typeof newSettings.startOnBoot === 'boolean') validated.startOnBoot = newSettings.startOnBoot
    if (typeof newSettings.mediaPlayerPath === 'string') validated.mediaPlayerPath = newSettings.mediaPlayerPath
    if (Array.isArray(newSettings.rssFeeds)) validated.rssFeeds = newSettings.rssFeeds
    if (Array.isArray(newSettings.rssRules)) validated.rssRules = newSettings.rssRules

    store.saveSettings(validated)
    const down = validated.downloadLimit > 0 ? validated.downloadLimit : 0
    const up = validated.uploadLimit > 0 ? validated.uploadLimit : 0
    if (typeof client.throttleDownload === 'function') {
      client.throttleDownload(down)
    }
    if (typeof client.throttleUpload === 'function') {
      client.throttleUpload(up)
    }
    
    // Trigger immediate RSS check if feeds were updated
    checkRssFeeds()
    
    return store.settings
  })

  ipcMain.handle('show-confirm-dialog', async (_event, title, message) => {
    if (!win) return false
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Cancel', 'Yes'],
      defaultId: 1,
      cancelId: 0,
      title,
      message,
    })
    return response === 1
  })

  ipcMain.handle('select-folder', async () => {
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  ipcMain.handle('toggle-devtools', () => {
    win?.webContents.toggleDevTools()
  })

  ipcMain.handle('set-clipboard-watch', (_event, enabled: boolean) => {
    if (enabled) {
      startClipboardWatch()
    } else {
      stopClipboardWatch()
    }
    return enabled
  })

  ipcMain.handle('get-clipboard-watch', () => {
    return !!clipboardWatchInterval
  })

  // File management & streaming
  let webtorrentServer: any = null

  ipcMain.handle('start-stream', async (_event, infoHash, fileIndex) => {
    const torrent = await client.get(infoHash)
    if (!torrent) throw new Error('Torrent not found')
    
    if (!webtorrentServer) {
      webtorrentServer = (client as any).createServer()
      await new Promise<void>((resolve) => {
        webtorrentServer.listen(0, () => {
          resolve()
        })
      })
    }
    const file = torrent.files[fileIndex]
    if (!file) throw new Error('File not found')
    const port = webtorrentServer.address().port
    return `http://localhost:${port}${file.streamURL}`
  })

  ipcMain.handle('play-external', async (_event, infoHash, fileIndex) => {
    try {
      const streamUrl = await (async () => {
        const torrent = await client.get(infoHash)
        if (!torrent || !torrent.files[fileIndex]) throw new Error('Torrent or file not found')
        if (!webtorrentServer) {
          webtorrentServer = (client as any).createServer()
          await new Promise<void>((resolve) => {
            webtorrentServer.listen(0, () => {
              resolve()
            })
          })
        }
        return `http://localhost:${webtorrentServer.address().port}${torrent.files[fileIndex].streamURL}`
      })()
      let playerPath = store.settings.mediaPlayerPath

      if (!playerPath) {
        // Fallback to natively launching VLC on macOS
        if (process.platform === 'darwin') {
          return new Promise((resolve, reject) => {
            execFile('open', ['-a', 'VLC', streamUrl], (err: any) => {
              if (err) {
                console.error('Failed to open VLC natively:', err)
                reject(new Error('VLC is not installed or failed to launch. Please select a media player in Settings.'))
              } else {
                resolve(true)
              }
            })
          })
        }

        // On other platforms or if we want to prompt:
        if (!win) throw new Error('No window available to prompt for player')
        const result = await dialog.showOpenDialog(win, {
          title: 'Select Media Player (e.g. VLC)',
          properties: ['openFile'],
          filters: [{ name: 'Applications', extensions: ['app', 'exe'] }]
        })
        if (!result.canceled && result.filePaths.length > 0) {
          playerPath = result.filePaths[0]
          store.saveSettings({ mediaPlayerPath: playerPath })
        } else {
          return false
        }
      }

      return new Promise((resolve, reject) => {
        const { execFile } = require('child_process')
        if (process.platform === 'darwin') {
          execFile('open', ['-a', playerPath, streamUrl], (err: any) => {
            if (err) {
              console.error('Failed to open external app:', err)
              // fallback for macOS if open -a fails (e.g., sandbox or non-app)
              execFile('open', [streamUrl], (fallbackErr: any) => {
                 if (fallbackErr) reject(err)
                 else resolve(true)
              })
            } else {
              resolve(true)
            }
          })
        } else {
          execFile(playerPath, [streamUrl], (err: any) => {
            if (err) reject(err)
            else resolve(true)
          })
        }
      })
    } catch (err: any) {
      console.error('Error launching external player:', err)
      throw err
    }
  })

  ipcMain.handle('copy-to-clipboard', (_event, text) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('clear-media-player', () => {
    store.saveSettings({ mediaPlayerPath: '' })
  })

  ipcMain.handle('stop-stream', async (_event, _infoHash) => {
    // WebTorrent global server stays alive for all streams. Nothing to do here.
  })

  ipcMain.handle('prioritize-file', async (_event, infoHash, fileIndex) => {
    try {
      console.log(`Prioritizing file ${fileIndex} for torrent ${infoHash}`)
      const torrent = await client.get(infoHash)
      if (torrent && torrent.files[fileIndex]) {
        console.log(`File found, selecting...`)
        torrent.files[fileIndex].select()
        const currentSkipped = store.state.skippedFiles || {}
        if (currentSkipped[infoHash]) {
          currentSkipped[infoHash] = currentSkipped[infoHash].filter((idx: number) => idx !== fileIndex)
          if (currentSkipped[infoHash].length === 0) {
            delete currentSkipped[infoHash]
          }
          store.saveState(store.state.activeTorrents, store.state.pausedTorrents, currentSkipped, store.state.torrentPaths || {}, store.state.processedRssLinks || [])
        }
        console.log(`Removed from skippedFiles`)
      } else {
        console.log(`Torrent or file not found!`)
      }
    } catch (err) {
      console.error('Failed to prioritize file:', err)
    }
  })

  ipcMain.handle('skip-file', async (_event, infoHash, fileIndex) => {
    try {
      console.log(`Skipping file ${fileIndex} for torrent ${infoHash}`)
      const torrent = await client.get(infoHash)
      if (torrent && torrent.files[fileIndex]) {
        console.log(`File found, deselecting...`)
        torrent.files[fileIndex].deselect()
        const currentSkipped = store.state.skippedFiles || {}
        if (!currentSkipped[infoHash]) {
          currentSkipped[infoHash] = []
        }
        if (!currentSkipped[infoHash].includes(fileIndex)) {
          currentSkipped[infoHash].push(fileIndex)
        }
        store.saveState(store.state.activeTorrents, store.state.pausedTorrents, currentSkipped, store.state.torrentPaths || {}, store.state.processedRssLinks || [])
        console.log(`Added to skippedFiles`)
      } else {
        console.log(`Torrent or file not found!`)
      }
    } catch (err) {
      console.error('Failed to skip file:', err)
    }
  })

  ipcMain.handle('open-torrent-dialog', async () => {
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Select .torrent file',
      properties: ['openFile'],
      filters: [{ name: 'Torrents', extensions: ['torrent'] }]
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  ipcMain.handle('set-sequential', async (_event, infoHash, sequential: boolean) => {
    try {
      const torrent = await client.get(infoHash)
      if (torrent) {
        console.log(`Sequential downloading set to ${sequential} for ${infoHash}`)
      }
    } catch (err) {
      console.error('Failed to set sequential:', err)
    }
  })

  ipcMain.handle('search-torrents', async (_event, query: string) => {
    try {
      const response = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(query)}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      // APB returns [{ id: '0' }] when no results found
      if (data.length === 1 && data[0].id === '0') return []

      const trackers = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://open.tracker.cl:1337/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'udp://exodus.desync.com:6969/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'wss://tracker.openwebtorrent.com',
        'wss://tracker.btorrent.xyz',
        'wss://tracker.fastcast.nz'
      ]
      const trStr = trackers.map(tr => `&tr=${encodeURIComponent(tr)}`).join('')

      return data
        .filter((item: any) => item.info_hash && item.info_hash !== '0000000000000000000000000000000000000000')
        .map((item: any) => ({
        name: item.name,
        infoHash: item.info_hash,
        seeders: parseInt(item.seeders),
        leechers: parseInt(item.leechers),
        size: parseInt(item.size),
        magnet: `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(item.name)}${trStr}`
      }))
    } catch (err: any) {
      console.error('Search failed:', err)
      return { error: err.message }
    }
  })

  ipcMain.handle('fetch-rss', async (_event, url: string) => {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (err: any) {
      console.error('RSS fetch failed:', err)
      return { error: err.message }
    }
  })
})

async function checkRssFeeds() {
  const { rssFeeds, rssRules } = store.settings
  if (!rssFeeds || !rssFeeds.length || !rssRules || !rssRules.length) return
  
  console.log('[RSS] Checking feeds for auto-download...')
  const processedRssLinks = store.state.processedRssLinks || []
  let processedLinksChanged = false

  for (const feedUrl of rssFeeds) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      const response = await fetch(feedUrl, { signal: controller.signal })
      clearTimeout(timeoutId)
      if (!response.ok) continue
      const xmlText = await response.text()
      
      // Basic regex parsing for RSS since we can't install rss-parser
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi
      let match
      while ((match = itemRegex.exec(xmlText)) !== null) {
        const itemHtml = match[1]
        const titleMatch = itemHtml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || itemHtml.match(/<title>(.*?)<\/title>/)
        const linkMatch = itemHtml.match(/<link>(.*?)<\/link>/) || itemHtml.match(/<enclosure[^>]+url="([^"]+)"/)
        
        if (titleMatch && linkMatch) {
          const title = titleMatch[1]
          const link = linkMatch[1]
          
          // Check rules
          for (const rule of rssRules) {
            try {
              const regex = new RegExp(rule, 'i')
              if (regex.test(title)) {
                if (!processedRssLinks.includes(link)) {
                  let searchId = link
                  if (link.startsWith('magnet:')) {
                    const ihMatch = link.match(/btih:([a-fA-F0-9]{40})/i)
                    if (ihMatch) searchId = ihMatch[1].toLowerCase()
                  }
                  
                  const existing = await client.get(searchId)
                  if (!existing) {
                    console.log(`[RSS] Auto-adding ${title} (matched rule: ${rule})`)
                    const torrent = client.add(link, { path: store.settings.downloadPath })
                    torrent.on('infoHash', () => {
                      originalIds.set(torrent.infoHash, link)
                      saveActiveTorrents()
                    })
                  }
                  
                  // Mark as processed regardless of whether we added it or it was already in client
                  processedRssLinks.push(link)
                  processedLinksChanged = true
                }
                break // Stop checking rules for this item if matched
              }
            } catch (e) {
              console.error(`[RSS] Invalid regex rule: ${rule}`, e)
            }
          }
        }
      }
    } catch (err) {
      console.error(`[RSS] Failed to check feed ${feedUrl}:`, err)
    }
  }
  
  if (processedLinksChanged) {
    store.saveState(store.state.activeTorrents, store.state.pausedTorrents, store.state.skippedFiles || {}, store.state.torrentPaths || {}, processedRssLinks)
  }
}

// Start polling every 15 minutes
setInterval(checkRssFeeds, 15 * 60 * 1000)
// Check on startup
setTimeout(checkRssFeeds, 5000)
