/**
 * Chrome·Windows는 ERP 탭이 숨거나 다른 창 뒤로 가면 OCR(WASM)을 거의 멈춘다.
 * Screen Wake Lock은 탭이 숨으면 풀린다.
 *
 * 실제로 면제되는 쪽: 재생 중인 미디어, Web Lock 점유, 최근 패킷이 있는 WebRTC.
 * 클릭 직후 unlock 으로 소리를 걸어 두고, 스캔 중에는 작은 진행 창(PiP)을 띄운다.
 */

type WakeLockSentinelLike = { release: () => Promise<void> }

export type PurchaseTaxScanKeepAlive = {
  stop: () => void
}

let runningCount = 0
const runningListeners = new Set<(running: boolean) => void>()

function setScanRunning(delta: 1 | -1) {
  const prev = runningCount > 0
  runningCount = Math.max(0, runningCount + delta)
  const next = runningCount > 0
  if (prev === next) return
  for (const fn of runningListeners) fn(next)
}

export function isPurchaseTaxScanRunning(): boolean {
  return runningCount > 0
}

export function subscribePurchaseTaxScanRunning(fn: (running: boolean) => void): () => void {
  runningListeners.add(fn)
  return () => {
    runningListeners.delete(fn)
  }
}

/** 디지털 무음은 Chrome이 '재생 중'으로 안 본다. 1비트 디더. */
export function createQuietWavBlob(seconds = 2): Blob {
  const sampleRate = 8000
  const n = Math.max(8000, Math.floor(sampleRate * seconds))
  const buf = new ArrayBuffer(44 + n)
  const v = new DataView(buf)
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) v.setUint8(offset + i, s.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  v.setUint32(4, 36 + n, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate, true)
  v.setUint16(32, 1, true)
  v.setUint16(34, 8, true)
  ascii(36, 'data')
  v.setUint32(40, n, true)
  for (let i = 0; i < n; i += 1) {
    v.setUint8(44 + i, 128 + (i % 97 === 0 ? 1 : 0))
  }
  return new Blob([buf], { type: 'audio/wav' })
}

const WORKER_SRC = `
self.onmessage = function (e) {
  if (e.data === 'stop') {
    self.close()
    return
  }
}
setInterval(function () {
  var n = 0
  for (var i = 0; i < 8000; i++) n += i
  try { self.postMessage(n) } catch (err) {}
}, 250)
`

type MediaHold = { stop: () => void }

let mediaHold: MediaHold | null = null
let pipVideo: HTMLVideoElement | null = null
let pipCanvas: HTMLCanvasElement | null = null
let pipStream: MediaStream | null = null
let audioCtx: AudioContext | null = null

function stopMediaHold() {
  try {
    mediaHold?.stop()
  } catch {
    /* ignore */
  }
  mediaHold = null
}

function startInaudibleAudio(): MediaHold | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  const stops: Array<() => void> = []

  try {
    const audio = document.createElement('audio')
    audio.loop = true
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
    audio.volume = 0.02
    audio.style.display = 'none'
    const wavUrl = URL.createObjectURL(createQuietWavBlob(4))
    audio.src = wavUrl
    document.body.appendChild(audio)
    const play = audio.play()
    if (play && typeof play.catch === 'function') play.catch(() => undefined)
    stops.push(() => {
      try {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        audio.remove()
      } catch {
        /* ignore */
      }
      try {
        URL.revokeObjectURL(wavUrl)
      } catch {
        /* ignore */
      }
    })
  } catch {
    /* ignore */
  }

  try {
    const AC =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AC) {
      const ctx = new AC()
      audioCtx = ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 18000
      gain.gain.value = 0.0004
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      void ctx.resume().catch(() => undefined)
      stops.push(() => {
        try {
          osc.stop()
        } catch {
          /* ignore */
        }
        void ctx.close().catch(() => undefined)
        if (audioCtx === ctx) audioCtx = null
      })
    }
  } catch {
    /* ignore */
  }

  if (!stops.length) return null
  return {
    stop: () => {
      for (const fn of stops.splice(0).reverse()) {
        try {
          fn()
        } catch {
          /* ignore */
        }
      }
    },
  }
}

async function startRtcLoopback(): Promise<() => void> {
  if (typeof RTCPeerConnection === 'undefined') return () => undefined
  const a = new RTCPeerConnection()
  const b = new RTCPeerConnection()
  let ping: number | undefined
  const close = () => {
    if (ping != null) window.clearInterval(ping)
    try {
      a.close()
    } catch {
      /* ignore */
    }
    try {
      b.close()
    } catch {
      /* ignore */
    }
  }
  try {
    a.onicecandidate = (ev) => {
      if (ev.candidate) void b.addIceCandidate(ev.candidate)
    }
    b.onicecandidate = (ev) => {
      if (ev.candidate) void a.addIceCandidate(ev.candidate)
    }
    const channel = a.createDataChannel('cm-pti-scan')
    channel.onopen = () => {
      ping = window.setInterval(() => {
        if (channel.readyState !== 'open') return
        try {
          channel.send('1')
        } catch {
          /* ignore */
        }
      }, 400)
    }
    const offer = await a.createOffer()
    await a.setLocalDescription(offer)
    await b.setRemoteDescription(offer)
    const answer = await b.createAnswer()
    await b.setLocalDescription(answer)
    await a.setRemoteDescription(answer)
    return close
  } catch {
    close()
    return () => undefined
  }
}

function drawScanProgress(n: number, total: number) {
  if (!pipCanvas) return
  const ctx = pipCanvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#111827'
  ctx.fillRect(0, 0, pipCanvas.width, pipCanvas.height)
  ctx.fillStyle = '#f9fafb'
  ctx.font = '600 18px sans-serif'
  ctx.fillText('CM ERP', 20, 40)
  ctx.font = '700 42px sans-serif'
  ctx.fillText(`${n} / ${total}`, 20, 100)
  ctx.font = '16px sans-serif'
  ctx.fillStyle = '#d1d5db'
  ctx.fillText('reading…', 20, 140)
  const ratio = total > 0 ? Math.max(0, Math.min(1, n / total)) : 0
  ctx.fillStyle = '#374151'
  ctx.fillRect(20, 156, 280, 8)
  ctx.fillStyle = '#34d399'
  ctx.fillRect(20, 156, Math.round(280 * ratio), 8)
}

export function updatePurchaseTaxScanKeepAliveProgress(n: number, total: number) {
  drawScanProgress(Math.max(0, n), Math.max(1, total))
}

async function startProgressPip(): Promise<() => void> {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => undefined
  if (!document.pictureInPictureEnabled) return () => undefined
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    pipCanvas = canvas
    drawScanProgress(0, 1)
    const stream = canvas.captureStream(4)
    pipStream = stream
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.setAttribute('playsinline', '')
    video.srcObject = stream
    video.style.position = 'fixed'
    video.style.width = '1px'
    video.style.height = '1px'
    video.style.opacity = '0'
    video.style.pointerEvents = 'none'
    video.style.bottom = '0'
    document.body.appendChild(video)
    pipVideo = video
    await video.play()
    if (!document.pictureInPictureElement) {
      await video.requestPictureInPicture()
    }
    return () => {
      try {
        if (document.pictureInPictureElement) void document.exitPictureInPicture()
      } catch {
        /* ignore */
      }
      try {
        video.pause()
        video.srcObject = null
        video.remove()
      } catch {
        /* ignore */
      }
      for (const track of stream.getTracks()) {
        try {
          track.stop()
        } catch {
          /* ignore */
        }
      }
      if (pipVideo === video) pipVideo = null
      if (pipCanvas === canvas) pipCanvas = null
      if (pipStream === stream) pipStream = null
    }
  } catch {
    pipVideo = null
    pipCanvas = null
    pipStream = null
    return () => undefined
  }
}

/**
 * 파일 선택·드래그 클릭 직후 호출. 제스처가 있을 때만 소리가 시작된다.
 */
export function unlockPurchaseTaxScanKeepAlive(): void {
  if (typeof window === 'undefined') return
  if (!mediaHold) mediaHold = startInaudibleAudio()
}

export function releasePurchaseTaxScanKeepAliveUnlock(): void {
  if (runningCount > 0) return
  stopMediaHold()
}

export function startPurchaseTaxScanKeepAlive(): PurchaseTaxScanKeepAlive {
  setScanRunning(1)
  if (typeof window === 'undefined') {
    let stopped = false
    return {
      stop: () => {
        if (stopped) return
        stopped = true
        setScanRunning(-1)
      },
    }
  }

  unlockPurchaseTaxScanKeepAlive()

  const cleanups: Array<() => void> = []
  let wake: WakeLockSentinelLike | null = null
  let worker: Worker | null = null
  let stopped = false
  let unlockWebLock: (() => void) | null = null

  try {
    const locks = navigator.locks
    if (locks?.request) {
      void locks.request('cm-pti-scan', { mode: 'exclusive' }, () => {
        return new Promise<void>((resolve) => {
          unlockWebLock = resolve
        })
      })
      cleanups.push(() => {
        try {
          unlockWebLock?.()
        } catch {
          /* ignore */
        }
        unlockWebLock = null
      })
    }
  } catch {
    /* ignore */
  }

  const requestWake = async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
      }
      wake = (await nav.wakeLock?.request('screen')) || null
    } catch {
      wake = null
    }
  }

  const startWorker = () => {
    if (worker || typeof Worker === 'undefined' || typeof Blob === 'undefined') return
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))
      worker = new Worker(url)
      URL.revokeObjectURL(url)
      worker.onerror = () => {
        try {
          worker?.terminate()
        } catch {
          /* ignore */
        }
        worker = null
      }
    } catch {
      worker = null
    }
  }

  void requestWake()
  startWorker()
  void startRtcLoopback().then((stopRtc) => {
    if (stopped) {
      stopRtc()
      return
    }
    cleanups.push(stopRtc)
  })
  void startProgressPip().then((stopPip) => {
    if (stopped) {
      stopPip()
      return
    }
    cleanups.push(stopPip)
  })

  const tick = window.setInterval(() => {
    void requestWake()
    if (!worker) startWorker()
    if (!mediaHold) mediaHold = startInaudibleAudio()
    void audioCtx?.resume().catch(() => undefined)
  }, 4000)
  cleanups.push(() => window.clearInterval(tick))

  const onVis = () => {
    if (document.visibilityState === 'hidden') return
    void requestWake()
    if (!worker) startWorker()
    if (!mediaHold) mediaHold = startInaudibleAudio()
    void audioCtx?.resume().catch(() => undefined)
  }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('focus', onVis)
  window.addEventListener('pageshow', onVis)
  window.addEventListener('resume', onVis)
  cleanups.push(() => {
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('focus', onVis)
    window.removeEventListener('pageshow', onVis)
    window.removeEventListener('resume', onVis)
  })

  return {
    stop: () => {
      if (stopped) return
      stopped = true
      for (const fn of cleanups.splice(0).reverse()) {
        try {
          fn()
        } catch {
          /* ignore */
        }
      }
      try {
        worker?.postMessage('stop')
        worker?.terminate()
      } catch {
        /* ignore */
      }
      worker = null
      void wake?.release()
      wake = null
      stopMediaHold()
      setScanRunning(-1)
    },
  }
}
