import { MediaPipeline } from '../call/media-pipeline.js'
import { applyRemoteControl, type CallInfo } from '../call/call-session.js'
import type { MediaFrameMessage } from '../call/call-encoding.js'
import type { SessionView } from '../app/session-view.js'
import { avatarColor, avatarInitials } from '../util/avatar.js'
import { callDurationSeconds, formatCallDuration } from '../util/duration.js'

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function avatarHtml(id: string, size: 'sm' | 'md' | 'lg' | 'xl' | '' = '', label?: string, avatarUrl?: string): string {
  const bg = avatarColor(id || 'default')
  const text = avatarInitials(label || id)
  const escapedLabel = escapeHtml(label || id)
  if (avatarUrl && avatarUrl.trim()) {
    return `<div class="avatar ${size} has-img" title="${escapedLabel}"><img src="${avatarUrl}" alt="${escapedLabel}" /></div>`
  }
  return `<div class="avatar ${size}" style="background:${bg}" title="${escapedLabel}">${text}</div>`
}

const ICONS = {
  phone: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  phoneOff: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>`,
  video: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`,
  videoOff: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m4 0h5a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  mic: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  micOff: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`
}

/**
 * Deep module managing 1:1 P2P Audio & Video Call UI and media presentation lifecycle.
 * Encapsulates MediaPipeline, ringtones (AudioContext), call timer, and in-place DOM updates
 * behind a minimal seam.
 */
export class CallOverlay {
  private incomingCallInfo: CallInfo | null = null
  private activeCallInfo: CallInfo | null = null
  private isLocalAudioMuted = false
  private isLocalVideoMuted = false
  private callDurationTimer: ReturnType<typeof setInterval> | null = null
  private ringAudio: AudioContext | null = null
  private ringInterval: ReturnType<typeof setInterval> | null = null
  private mediaPipeline = new MediaPipeline()

  private container: HTMLElement | null = null
  private session: SessionView | null = null
  private nicknames = new Map<string, string>()
  private avatars = new Map<string, string>()

  mount(container: HTMLElement): void {
    this.container = container
    this.update()
  }

  setSession(session: SessionView | null): void {
    this.session = session
  }

  setPeerLookup(nicknames: Map<string, string>, avatars: Map<string, string>): void {
    this.nicknames = nicknames
    this.avatars = avatars
    if (this.incomingCallInfo || this.activeCallInfo) {
      this.update()
    }
  }

  getMediaPipeline(): MediaPipeline {
    return this.mediaPipeline
  }

  async startCall(peerId: string, roomId: string, media: { audio: boolean; video: boolean }): Promise<void> {
    if (this.activeCallInfo && this.activeCallInfo.state !== 'ended') {
      alert('You are already in an active call.')
      return
    }

    try {
      this.isLocalAudioMuted = false
      this.isLocalVideoMuted = false
      this.stopDurationTimer()

      if (!this.session) {
        throw new Error('Session not ready')
      }

      const info = await this.session.startCall(peerId, roomId, media)
      this.activeCallInfo = info
      this.startRingtone('outgoing')
      this.update()

      await this.mediaPipeline.start({
        callId: info.callId,
        audio: media.audio,
        video: media.video,
        onSendFrame: (frame) => this.session?.sendCallFrame(frame)
      })

      this.update()
    } catch (err: any) {
      this.stopRingtone()
      this.activeCallInfo = null
      this.update()
      alert(`Could not start call: ${err?.message || err}`)
    }
  }

  handleIncomingCall(info: CallInfo): void {
    if (this.activeCallInfo && this.activeCallInfo.state !== 'ended') {
      return
    }
    this.incomingCallInfo = info
    this.startRingtone('incoming')
    this.update()
  }

  async acceptIncomingCall(): Promise<void> {
    if (!this.incomingCallInfo || !this.session) return
    this.stopRingtone()
    const info = this.incomingCallInfo
    this.incomingCallInfo = null
    this.activeCallInfo = info
    this.isLocalAudioMuted = false
    this.isLocalVideoMuted = false
    this.update()

    try {
      this.session.answerCall(info.callId, true)
      this.startDurationTimer()

      await this.mediaPipeline.start({
        callId: info.callId,
        audio: true,
        video: info.media.video,
        onSendFrame: (frame) => this.session?.sendCallFrame(frame)
      })

      this.update()
    } catch (err: any) {
      console.error('[call-overlay] Error accepting call:', err)
      alert(`Could not accept call: ${err?.message || err}`)
      this.hangupCall()
    }
  }

  declineIncomingCall(): void {
    if (!this.incomingCallInfo || !this.session) return
    this.stopRingtone()
    const info = this.incomingCallInfo
    this.incomingCallInfo = null
    this.session.answerCall(info.callId, false)
    this.update()
  }

  handleCallStateChange(info: CallInfo): void {
    if (this.incomingCallInfo?.callId === info.callId && (info.state === 'ended' || info.state === 'connected')) {
      this.incomingCallInfo = null
      this.stopRingtone()
    }

    if (this.activeCallInfo?.callId === info.callId) {
      this.activeCallInfo = info
      if (info.state === 'connected') {
        this.stopRingtone()
        this.startDurationTimer()
        if (info.media.video && this.container) {
          const localVideo = this.container.querySelector<HTMLVideoElement>('#callLocalVideo')
          this.mediaPipeline.attachLocalVideo(localVideo)
          const remoteCanvas = this.container.querySelector<HTMLCanvasElement>('#callRemoteCanvas')
          this.mediaPipeline.attachRemoteCanvas(remoteCanvas)
        }
      } else if (info.state === 'ended') {
        this.handleCallEnded(info)
        return
      }
      this.update()
    }
  }

  handleCallEnded(info: CallInfo): void {
    this.stopRingtone()
    this.stopDurationTimer()
    this.mediaPipeline.stop()
    if (this.incomingCallInfo?.callId === info.callId) {
      this.incomingCallInfo = null
    }
    if (this.activeCallInfo?.callId === info.callId) {
      this.activeCallInfo = null
    }
    this.update()
  }

  handleCallRemoteControl(callId: string, action: string): void {
    if (this.activeCallInfo && this.activeCallInfo.callId === callId) {
      this.activeCallInfo = applyRemoteControl(this.activeCallInfo, action)
      this.update()
    }
  }

  handleIncomingFrame(frame: MediaFrameMessage): void {
    this.mediaPipeline.handleIncomingFrame(frame)
  }

  /** The wire's backpressure, on its way to the thing producing frames for it. */
  handleCallMediaPressure(wantsMore: boolean): void {
    this.mediaPipeline.setWirePressure(wantsMore)
  }

  toggleCallMute(): void {
    this.isLocalAudioMuted = !this.isLocalAudioMuted
    this.mediaPipeline.setAudioMuted(this.isLocalAudioMuted)
    this.session?.sendCallControl(this.isLocalAudioMuted ? 'mute' : 'unmute')
    this.update()
  }

  toggleCallVideo(): void {
    this.isLocalVideoMuted = !this.isLocalVideoMuted
    this.mediaPipeline.setVideoMuted(this.isLocalVideoMuted)
    this.session?.sendCallControl(this.isLocalVideoMuted ? 'camera-off' : 'camera-on')
    this.update()
  }

  hangupCall(): void {
    this.stopRingtone()
    this.stopDurationTimer()
    this.mediaPipeline.stop()
    if (this.activeCallInfo) {
      this.session?.endCall(this.activeCallInfo.callId)
      this.activeCallInfo = null
    }
    this.update()
  }

  update(): void {
    if (!this.container) return

    // 1. Incoming Call Overlay Mount
    const incMount = this.container.querySelector('#callIncomingMount')
    if (incMount) {
      if (this.incomingCallInfo) {
        const existingOverlay = incMount.querySelector('#incomingCallOverlay') as HTMLElement | null
        if (!existingOverlay || existingOverlay.dataset.callId !== this.incomingCallInfo.callId) {
          incMount.innerHTML = this.renderIncomingCallModal()
          this.wireIncomingCallModal()
        }
      } else {
        if (incMount.innerHTML !== '') incMount.innerHTML = ''
      }
    }

    // 2. Active Call Floating Widget Mount
    const actMount = this.container.querySelector('#callActiveMount')
    if (actMount) {
      if (this.activeCallInfo) {
        const existingWidget = actMount.querySelector('#callActiveWidget') as HTMLElement | null
        if (!existingWidget || existingWidget.dataset.callId !== this.activeCallInfo.callId) {
          actMount.innerHTML = this.renderActiveCallWidget()
          this.wireActiveCallWidget()
        } else {
          // In-place dynamic updates: avoid replacing innerHTML to keep video and canvas streams uninterrupted
          const info = this.activeCallInfo
          const isVideo = info.media.video
          const isConnected = info.state === 'connected'

          let statusText = 'Connecting...'
          let statusClass = 'ringing'
          if (info.state === 'calling') statusText = 'Calling...'
          else if (info.state === 'ringing') statusText = 'Ringing...'
          else if (isConnected) {
            statusText = formatCallDuration(callDurationSeconds(info.startedAt, Date.now()))
            statusClass = ''
          }

          const timerEl = actMount.querySelector('#callTimerDisplay')
          if (timerEl) {
            timerEl.className = `call-widget-status ${statusClass}`.trim()
            timerEl.innerHTML = `${isVideo ? ICONS.video : ICONS.phone} ${statusText}`
          }

          const muteBtn = actMount.querySelector('#toggleCallMuteBtn')
          if (muteBtn) {
            muteBtn.className = `call-btn-control ${this.isLocalAudioMuted ? 'active-off' : ''}`
            muteBtn.setAttribute('title', this.isLocalAudioMuted ? 'Unmute' : 'Mute')
            muteBtn.innerHTML = this.isLocalAudioMuted ? ICONS.micOff : ICONS.mic
          }

          const videoBtn = actMount.querySelector('#toggleCallVideoBtn')
          if (videoBtn) {
            videoBtn.className = `call-btn-control ${this.isLocalVideoMuted ? 'active-off' : ''}`
            videoBtn.setAttribute('title', this.isLocalVideoMuted ? 'Turn Camera On' : 'Turn Camera Off')
            videoBtn.innerHTML = this.isLocalVideoMuted ? ICONS.videoOff : ICONS.video
          }

          if (isVideo) {
            const stage = actMount.querySelector('#callVideoStage')
            const existingPh = actMount.querySelector('.call-video-placeholder')
            const isRemoteOff = !!(info as any).remoteCameraOff
            if (isRemoteOff && !existingPh && stage) {
              const peerName = this.resolvePeerName(info.peerId)
              const peerAvatar = this.resolvePeerAvatar(info.peerId)
              const ph = document.createElement('div')
              ph.className = 'call-video-placeholder'
              ph.innerHTML = `${avatarHtml(info.peerId, 'md', peerName, peerAvatar)}<span>${escapeHtml(peerName)}'s camera is off</span>`
              stage.appendChild(ph)
            } else if (!isRemoteOff && existingPh) {
              existingPh.remove()
            }

            const localVideo = actMount.querySelector<HTMLVideoElement>('#callLocalVideo')
            const localStream = this.mediaPipeline.getLocalStream()
            if (localVideo && localStream && localVideo.srcObject !== localStream) {
              this.mediaPipeline.attachLocalVideo(localVideo)
            }
          }
        }
      } else {
        if (actMount.innerHTML !== '') actMount.innerHTML = ''
      }
    }
  }

  destroy(): void {
    this.stopRingtone()
    this.stopDurationTimer()
    this.mediaPipeline.stop()
    this.incomingCallInfo = null
    this.activeCallInfo = null
    if (this.container) {
      const incMount = this.container.querySelector('#callIncomingMount')
      if (incMount) incMount.innerHTML = ''
      const actMount = this.container.querySelector('#callActiveMount')
      if (actMount) actMount.innerHTML = ''
    }
  }

  private resolvePeerName(peerId: string): string {
    const contact = this.session?.listContacts().find((c) => c.userId === peerId)
    return this.nicknames.get(peerId) || contact?.nickname || peerId.slice(0, 10)
  }

  private resolvePeerAvatar(peerId: string): string {
    const contact = this.session?.listContacts().find((c) => c.userId === peerId)
    return this.avatars.get(peerId) || this.session?.getPeerAvatar(peerId) || contact?.avatar || ''
  }

  private renderIncomingCallModal(): string {
    if (!this.incomingCallInfo) return ''
    const info = this.incomingCallInfo
    const peerName = this.resolvePeerName(info.peerId)
    const peerAvatar = this.resolvePeerAvatar(info.peerId)
    const isVideo = info.media.video

    return `
      <div class="call-incoming-overlay" id="incomingCallOverlay" data-call-id="${info.callId}">
        <div class="call-incoming-card">
          <div class="call-avatar-ring">
            ${avatarHtml(info.peerId, 'lg', peerName, peerAvatar)}
          </div>
          <h3 class="call-incoming-title">${escapeHtml(peerName)}</h3>
          <div class="call-incoming-subtitle">
            ${isVideo ? ICONS.video : ICONS.phone}
            <span>Incoming ${isVideo ? 'Video' : 'Audio'} Call...</span>
          </div>
          <div class="call-actions-row">
            <div class="call-action-col">
              <button class="call-btn-circle call-btn-decline" id="declineCallBtn" title="Decline call">
                ${ICONS.phoneOff}
              </button>
              <span class="call-action-label">Decline</span>
            </div>
            <div class="call-action-col">
              <button class="call-btn-circle call-btn-accept" id="acceptCallBtn" title="Accept call">
                ${ICONS.phone}
              </button>
              <span class="call-action-label">Accept</span>
            </div>
          </div>
        </div>
      </div>
    `
  }

  private renderActiveCallWidget(): string {
    if (!this.activeCallInfo) return ''
    const info = this.activeCallInfo
    const peerName = this.resolvePeerName(info.peerId)
    const peerAvatar = this.resolvePeerAvatar(info.peerId)
    const isVideo = info.media.video
    const isConnected = info.state === 'connected'

    let statusText = 'Connecting...'
    let statusClass = 'ringing'
    if (info.state === 'calling') {
      statusText = 'Calling...'
    } else if (info.state === 'ringing') {
      statusText = 'Ringing...'
    } else if (isConnected) {
      statusText = formatCallDuration(callDurationSeconds(info.startedAt, Date.now()))
      statusClass = ''
    }

    return `
      <div class="call-active-widget" id="callActiveWidget" data-call-id="${info.callId}">
        <div class="call-widget-header">
          <div class="call-widget-peer-info">
            ${avatarHtml(info.peerId, 'sm', peerName, peerAvatar)}
            <div>
              <div class="call-widget-name">${escapeHtml(peerName)}</div>
              <div class="call-widget-status ${statusClass}" id="callTimerDisplay">
                ${isVideo ? ICONS.video : ICONS.phone} ${statusText}
              </div>
            </div>
          </div>
        </div>

        ${isVideo ? `
          <div class="call-video-stage" id="callVideoStage">
            <canvas class="call-remote-canvas" id="callRemoteCanvas"></canvas>
            <video class="call-local-video" id="callLocalVideo" autoplay playsinline muted></video>
            ${info.remoteCameraOff ? `
              <div class="call-video-placeholder">
                ${avatarHtml(info.peerId, 'md', peerName, peerAvatar)}
                <span>${escapeHtml(peerName)}'s camera is off</span>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <div class="call-controls-bar">
          <button class="call-btn-control ${this.isLocalAudioMuted ? 'active-off' : ''}" id="toggleCallMuteBtn" title="${this.isLocalAudioMuted ? 'Unmute' : 'Mute'}">
            ${this.isLocalAudioMuted ? ICONS.micOff : ICONS.mic}
          </button>
          ${isVideo ? `
            <button class="call-btn-control ${this.isLocalVideoMuted ? 'active-off' : ''}" id="toggleCallVideoBtn" title="${this.isLocalVideoMuted ? 'Turn Camera On' : 'Turn Camera Off'}">
              ${this.isLocalVideoMuted ? ICONS.videoOff : ICONS.video}
            </button>
          ` : ''}
          <button class="call-btn-circle call-btn-hangup" style="width:44px;height:44px;" id="hangupCallBtn" title="End Call">
            ${ICONS.phoneOff}
          </button>
        </div>
      </div>
    `
  }

  private wireIncomingCallModal(): void {
    if (!this.container) return
    const incMount = this.container.querySelector('#callIncomingMount') || this.container
    incMount.querySelector('#acceptCallBtn')?.addEventListener('click', () => void this.acceptIncomingCall())
    incMount.querySelector('#declineCallBtn')?.addEventListener('click', () => this.declineIncomingCall())
  }

  private wireActiveCallWidget(): void {
    if (!this.container) return
    const actMount = this.container.querySelector('#callActiveMount') || this.container
    actMount.querySelector('#toggleCallMuteBtn')?.addEventListener('click', () => this.toggleCallMute())
    actMount.querySelector('#toggleCallVideoBtn')?.addEventListener('click', () => this.toggleCallVideo())
    actMount.querySelector('#hangupCallBtn')?.addEventListener('click', () => this.hangupCall())

    if (this.activeCallInfo?.media.video) {
      const localVideo = actMount.querySelector<HTMLVideoElement>('#callLocalVideo')
      this.mediaPipeline.attachLocalVideo(localVideo)
      const remoteCanvas = actMount.querySelector<HTMLCanvasElement>('#callRemoteCanvas')
      this.mediaPipeline.attachRemoteCanvas(remoteCanvas)
    }
  }

  private startRingtone(type: 'incoming' | 'outgoing'): void {
    this.stopRingtone()
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return
      this.ringAudio = new AudioCtx()

      const playTone = () => {
        if (!this.ringAudio || this.ringAudio.state === 'closed') return
        const osc = this.ringAudio.createOscillator()
        const gain = this.ringAudio.createGain()
        osc.type = 'sine'
        const freq = type === 'incoming' ? 880 : 440
        osc.frequency.setValueAtTime(freq, this.ringAudio.currentTime)
        gain.gain.setValueAtTime(0.08, this.ringAudio.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, this.ringAudio.currentTime + (type === 'incoming' ? 0.8 : 1.2))
        osc.connect(gain)
        gain.connect(this.ringAudio.destination)
        osc.start()
        osc.stop(this.ringAudio.currentTime + (type === 'incoming' ? 0.8 : 1.2))
      }

      playTone()
      this.ringInterval = setInterval(playTone, type === 'incoming' ? 2000 : 3500)
    } catch (e) {
      console.warn('[call-overlay] Could not play ringtone:', e)
    }
  }

  private stopRingtone(): void {
    if (this.ringInterval) {
      clearInterval(this.ringInterval)
      this.ringInterval = null
    }
    if (this.ringAudio && this.ringAudio.state !== 'closed') {
      this.ringAudio.close().catch(() => {})
      this.ringAudio = null
    }
  }

  /** Ticks once a second to repaint, but reads the elapsed time from `startedAt` each time rather
   *  than counting — see `callDurationSeconds`. A tick that arrives late, or not at all while the
   *  window is in the background, then costs a repaint rather than a second off the clock. */
  private startDurationTimer(): void {
    this.stopDurationTimer()
    this.callDurationTimer = setInterval(() => {
      if (!this.container) return
      const timerEl = this.container.querySelector('#callTimerDisplay')
      if (timerEl && this.activeCallInfo?.state === 'connected') {
        const isVideo = this.activeCallInfo.media.video
        const elapsed = callDurationSeconds(this.activeCallInfo.startedAt, Date.now())
        timerEl.innerHTML = `${isVideo ? ICONS.video : ICONS.phone} ${formatCallDuration(elapsed)}`
      }
    }, 1000)
  }

  private stopDurationTimer(): void {
    if (this.callDurationTimer) {
      clearInterval(this.callDurationTimer)
      this.callDurationTimer = null
    }
  }

}
