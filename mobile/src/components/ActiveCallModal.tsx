import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Image,
  BackHandler,
  StatusBar
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera'
import { requestRecordingPermissionsAsync } from 'expo-audio'
import { bareClient } from '../bare/client'
import { frameDataUri, VIDEO_FRAME, AUDIO_FRAME, type WireMediaFrame } from '../bare/media-frame'
import { callAudio, NATIVE_CALL_AUDIO_ENABLED } from '../call-audio'
import { MediaBackpressure } from '@core/call/media-backpressure'
import { pickCaptureSize } from '@core/call/capture-size'
import { useSession } from '../hooks/useSession'
import { useTheme } from '../theme-context'
import { spacing, typography, radii, shadows, type ThemeColors } from '../theme'
import Avatar from './Avatar'
import { formatCallDuration } from '@core/util/duration'

/**
 * What each of the core's end reasons means to whoever was on the call.
 *
 * Every one of these used to look identical from the outside — the call screen vanished and you
 * were back at your contacts. A peer declining, a peer already on another call, nobody answering
 * and the connection dropping are four different things, and only one of them is worth retrying
 * immediately.
 */
function callEndLabel(reason: string): string {
  switch (reason) {
    case 'hangup': return 'Call ended'
    case 'rejected': return 'Call declined'
    case 'timeout': return 'No answer'
    case 'busy': return 'Peer is already on a call'
    case 'error': return 'Connection lost'
    default: return `Call ended (${reason})`
  }
}

/**
 * Which side decided, in words, for the endings where that is the whole question.
 *
 * "Connection lost" reads the same whether this phone lost the peer or the peer's machine lost
 * this phone and said so — the reason travels on the wire, so both ends print the other's. Only
 * the origin, which is decided locally, tells them apart, and telling them apart is the difference
 * between a fault here and a fault there.
 */
function callEndOriginLabel(reason: string, origin: string): string | null {
  if (reason !== 'error') return null
  switch (origin) {
    case 'peer-disconnected': return 'this device lost the connection'
    case 'remote': return 'the other device reported the loss'
    case 'no-info': return 'the call ended without saying why'
    case 'unreported': return 'ended by a build that predates this notice'
    default: return origin
  }
}

/** How long the notice stays up before it stops being news. */
const CALL_END_NOTICE_MS = 6000

export default function ActiveCallModal() {
  const {
    activeCall,
    callDuration,
    isCallMuted,
    isCallVideoOff,
    endCall,
    toggleCallMute,
    toggleCallVideo,
    nicknames,
    avatars,
    sendCallFrame,
    lastCallEnd,
    dismissLastCallEnd
  } = useSession()

  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [facing, setFacing] = useState<CameraType>('front')
  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)
  /**
   * What the camera is told to capture at.
   *
   * Undefined until the device has been asked what it offers, which is the only state in which the
   * old full-sensor behaviour still applies — and `isCameraReadyRef` keeps the capture loop from
   * taking a frame before then, so in practice nothing is ever captured unconstrained.
   */
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined)

  const isConnected = activeCall?.state === 'connected'
  const isVideo = activeCall?.media.video
  // Whether *this* side has a camera to show. It decides the self-view and what gets captured, and
  // nothing else: the remote video is the peer's to send or not, and was hidden for a while by this
  // being folded into the same condition that chose the whole video layout.
  const localCameraOn = !isCallVideoOff && !!permission?.granted

  const [remoteVideoFrame, setRemoteVideoFrame] = useState<string | null>(null)
  const isCameraReadyRef = useRef(false)
  const lastFrameTimeRef = useRef(0)
  // A ref, not state: this gates a `setInterval` and must never cause a re-render of a screen that
  // is already rendering video frames.
  const backpressureRef = useRef(new MediaBackpressure())

  // What the wire says it can carry. Every JPEG this screen sends costs a base64 encode, a JSON
  // stringify and a trip across the bridge before it even reaches the socket, so a frame the wire
  // cannot take yet is worth more here than on the desktop.
  const sendCallFrameRef = useRef(sendCallFrame)
  sendCallFrameRef.current = sendCallFrame

  useEffect(() => {
    const gate = backpressureRef.current
    return bareClient.on('callMediaPressure', (payload: { wantsMore: boolean }) => {
      gate.update(payload.wantsMore, Date.now())
    })
  }, [])

  // Listen to incoming remote video frames locally without re-rendering the whole application
  useEffect(() => {
    if (!isConnected || !isVideo) {
      setRemoteVideoFrame(null)
      return
    }

    return bareClient.on('callMediaFrame', (frame: WireMediaFrame) => {
      const now = Date.now()
      // Throttle to ~12 fps (80ms) to ensure smooth React Native bridge rendering and prevent stutter
      if (now - lastFrameTimeRef.current < 80) return
      const uri = frameDataUri(frame)
      if (!uri) return
      lastFrameTimeRef.current = now
      setRemoteVideoFrame(uri)
    })
  }, [isConnected, isVideo])

  // Synchronize mute state with native audio module
  useEffect(() => {
    callAudio.setMuted(isCallMuted)
  }, [isCallMuted])

  // Bidirectional real-time audio capture and streaming playback
  useEffect(() => {
    if (!isConnected) {
      callAudio.stopAll()
      return
    }

    callAudio.startPlayback()

    // `cancelled` closes a window that leaked a live microphone: the permission request is async,
    // so a call that ended — or a state change that re-ran this effect — while it was in flight ran
    // the cleanup first and then let the late `.then()` start capture anyway. Nothing was scheduled
    // to stop that capture, so the `AudioRecord` and its thread outlived the call, the audio mode
    // stayed in-communication, and the next call's `startCapture` returned early against the stale
    // one it could not see.
    let cancelled = false

    void requestRecordingPermissionsAsync()
      .then((perm) => {
        if (cancelled) return
        if (perm.granted) {
          callAudio.startCapture()
        }
      })
      .catch(() => {})

    // 1. Play received audio frames through native speaker / earpiece
    const unsubMedia = bareClient.on('callMediaFrame', (frame: WireMediaFrame) => {
      if (frame.kind === AUDIO_FRAME && frame.payload) {
        callAudio.playChunk(frame.payload)
      }
    })

    // 2. Stream captured microphone chunks over Protomux linda-call channel
    const unsubCapture = callAudio.onAudioCaptureChunk((base64Chunk: string) => {
      sendCallFrameRef.current({
        kind: AUDIO_FRAME,
        payload: base64Chunk,
        keyframe: true
      })
    })

    return () => {
      cancelled = true
      unsubMedia()
      unsubCapture()
      callAudio.stopAll()
    }
  }, [isConnected])

  // Periodic video frame capture & transmission from mobile camera
  useEffect(() => {
    if (!isConnected || !isVideo || !localCameraOn) return
    let isMounted = true
    let isCapturing = false
    let consecutiveErrors = 0
    let errorCooldownUntil = 0

    const interval = setInterval(async () => {
      const now = Date.now()
      if (now < errorCooldownUntil) return
      if (isCapturing || !isMounted || !cameraRef.current || !isCameraReadyRef.current) return
      // Asked before the camera is, because `takePictureAsync` is the expensive half of this loop.
      if (!backpressureRef.current.allowsVideo(now)) return
      isCapturing = true
      try {
        const pic = await cameraRef.current.takePictureAsync({
          quality: 0.25,
          base64: true,
          shutterSound: false
        })
        consecutiveErrors = 0
        if (isMounted && pic?.base64) {
          sendCallFrameRef.current({
            kind: VIDEO_FRAME,
            payload: pic.base64,
            keyframe: true
          })
        }
      } catch {
        consecutiveErrors++
        if (consecutiveErrors >= 3) {
          // Camera hardware busy or transitioning; back off to let Camera2 recover
          errorCooldownUntil = Date.now() + 1500
          consecutiveErrors = 0
        }
      } finally {
        isCapturing = false
      }
    }, 500)

    return () => {
      isMounted = false
      isCameraReadyRef.current = false
      backpressureRef.current.reset()
      clearInterval(interval)
    }
  }, [isConnected, isVideo, localCameraOn])

  // The notice is the only thing this component shows once a call is over, so it clears itself
  // rather than waiting for a screen the user may never open.
  useEffect(() => {
    if (!lastCallEnd) return
    const timer = setTimeout(dismissLastCallEnd, CALL_END_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [lastCallEnd, dismissLastCallEnd])

  const isVisible = Boolean(activeCall && activeCall.state !== 'idle' && activeCall.state !== 'ended')
  const peerId = activeCall?.peerId ?? ''
  const callId = activeCall?.callId ?? ''
  const peerName = (peerId ? nicknames.get(peerId) : null) || 'Linda Contact'
  const peerAvatar = peerId ? avatars.get(peerId) : undefined
  const remoteMuted = Boolean(activeCall?.remoteMuted)
  const remoteCameraOff = Boolean(activeCall?.remoteCameraOff)

  // Hardware back button support on Android
  useEffect(() => {
    if (!isVisible) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (callId) {
        void endCall(callId)
        return true
      }
      return false
    })
    return () => sub.remove()
  }, [isVisible, callId, endCall])

  if (!isVisible) {
    if (!lastCallEnd) return null
    const originLabel = callEndOriginLabel(lastCallEnd.reason, lastCallEnd.origin)
    return (
      <Pressable style={styles.endNotice} onPress={dismissLastCallEnd}>
        <Ionicons name="call-outline" size={16} color={colors.warning} />
        <View style={styles.endNoticeBody}>
          <Text style={styles.endNoticeText}>{callEndLabel(lastCallEnd.reason)}</Text>
          {originLabel && <Text style={styles.endNoticeDetail}>{originLabel}</Text>}
        </View>
      </Pressable>
    )
  }

  const toggleFacing = () => {
    isCameraReadyRef.current = false
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'))
  }

  const statusLabel = isConnected
    ? formatCallDuration(callDuration)
    : activeCall?.state === 'ringing'
      ? 'Ringing...'
      : 'Calling...'

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0e14" />
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={14} color={colors.accentLight} />
          <Text style={styles.badgeText}>Direct P2P (Holepunch)</Text>
        </View>
        <Text style={styles.timer}>{statusLabel}</Text>
      </View>

      {/* Main Body */}
      <View style={styles.mainArea}>
        {isVideo ? (
          <View style={styles.videoStage}>
              {/* Remote participant card / video area */}
              <View style={styles.remoteVideoPlaceholder}>
                {remoteVideoFrame && !remoteCameraOff ? (
                  <Image
                    source={{ uri: remoteVideoFrame }}
                    style={StyleSheet.absoluteFillObject}
                    resizeMode="cover"
                    fadeDuration={0}
                  />
                ) : (
                  <>
                    <Avatar
                      id={peerId}
                      label={peerName}
                      imageUrl={peerAvatar}
                      size="xl"
                    />
                    <Text style={styles.peerNameText}>{peerName}</Text>
                    <Text style={styles.subStatus}>
                      {isConnected
                        ? (remoteCameraOff ? 'Peer turned camera off' : 'P2P Media Stream Connected')
                        : 'Dialing peer over Hyperswarm...'}
                    </Text>
                  </>
                )}
                {remoteMuted && (
                  <View style={styles.remoteMutedPill}>
                    <Ionicons name="mic-off" size={14} color={colors.warning} />
                    <Text style={styles.remoteMutedText}>Peer is muted</Text>
                  </View>
                )}
              </View>

              {/* Local Self-View PiP */}
              <View style={styles.pipContainer}>
                {localCameraOn ? (
                  <CameraView
                    ref={cameraRef}
                    style={styles.cameraView}
                    facing={facing}
                    animateShutter={false}
                    flash="off"
                    enableTorch={false}
                    onMountError={(err) => {
                      console.warn('[active-call] camera mount error:', err)
                      isCameraReadyRef.current = false
                    }}
                    pictureSize={pictureSize}
                    onCameraReady={() => {
                      // Asked here rather than on mount: the list is only available once the camera
                      // has actually opened.
                      //
                      // `isCameraReadyRef` is set in `finally`, after the answer, rather than before
                      // asking — that flag is what lets the capture loop take a picture, and a frame
                      // taken in the gap would be the full-sensor one this whole change exists to
                      // stop. `finally` and not `then`, so a device that refuses to list its sizes
                      // still gets a video call, unconstrained as it was before.
                      void cameraRef.current?.getAvailablePictureSizesAsync()
                        .then((sizes) => {
                          const picked = pickCaptureSize(sizes ?? [])
                          if (picked) setPictureSize(picked)
                        })
                        .catch((err) => {
                          console.warn('[active-call] could not read camera picture sizes:', err)
                        })
                        .finally(() => {
                          isCameraReadyRef.current = true
                        })
                    }}
                  />
                ) : (
                  <View style={styles.pipOff}>
                    <Ionicons name="videocam-off" size={22} color="#94a3b8" />
                    <Text style={styles.pipOffText}>
                      {permission?.granted ? 'Camera off' : 'No camera access'}
                    </Text>
                  </View>
                )}
                <View style={styles.pipOverlay}>
                  <Text style={styles.pipLabel}>You</Text>
                </View>
              </View>

              {/* The camera this side never got permission for — asked here, where the call is. */}
              {!permission?.granted && (
                <Pressable
                  style={styles.videoPermissionBtn}
                  onPress={() => {
                    void requestPermission()
                  }}
                >
                  <Ionicons name="camera-outline" size={16} color="#ffffff" />
                  <Text style={styles.permissionBtnText}>Enable Camera</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.audioStage}>
              <View style={styles.avatarWrapper}>
                <Avatar
                  id={peerId}
                  label={peerName}
                  imageUrl={peerAvatar}
                  size="xl"
                />
              </View>
              <Text style={styles.peerNameText}>{peerName}</Text>
              <Text style={styles.subStatus}>
                {isConnected
                  ? (!NATIVE_CALL_AUDIO_ENABLED
                      // A build with the native audio module switched off would otherwise claim to
                      // be streaming audio while sending and playing none — see `call-audio.ts`.
                      ? 'Audio off — diagnostic build'
                      : '16 kHz HD Audio Stream')
                  : 'Ringing remote peer...'}
              </Text>
              {remoteMuted && (
                <View style={styles.remoteMutedPill}>
                  <Ionicons name="mic-off" size={14} color={colors.warning} />
                  <Text style={styles.remoteMutedText}>Peer is muted</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* In-Call Controls Bar */}
        <View style={styles.controlsBar}>
          {/* Mute Mic */}
          <Pressable
            style={[styles.controlBtn, isCallMuted && styles.controlBtnActive]}
            onPress={toggleCallMute}
            hitSlop={8}
            accessibilityLabel={isCallMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            <Ionicons
              name={isCallMuted ? 'mic-off' : 'mic'}
              size={24}
              color={isCallMuted ? colors.error : '#ffffff'}
            />
          </Pressable>

          {/* Toggle Video (if video call) */}
          {isVideo && (
            <Pressable
              style={[styles.controlBtn, isCallVideoOff && styles.controlBtnActive]}
              onPress={toggleCallVideo}
              hitSlop={8}
              accessibilityLabel={isCallVideoOff ? 'Turn video on' : 'Turn video off'}
            >
              <Ionicons
                name={isCallVideoOff ? 'videocam-off' : 'videocam'}
                size={24}
                color={isCallVideoOff ? colors.error : '#ffffff'}
              />
            </Pressable>
          )}

          {/* Flip Camera (if video call and camera is active) */}
          {isVideo && !isCallVideoOff && (
            <Pressable
              style={styles.controlBtn}
              onPress={toggleFacing}
              hitSlop={8}
              accessibilityLabel="Flip camera"
            >
              <Ionicons name="camera-reverse" size={24} color="#ffffff" />
            </Pressable>
          )}

          {/* Hang up */}
          <Pressable
            style={[styles.controlBtn, styles.hangupBtn]}
            onPress={() => {
              if (callId) void endCall(callId)
            }}
            hitSlop={8}
            accessibilityLabel="End call"
          >
            <Ionicons name="call" size={26} color="#ffffff" style={styles.hangupIcon} />
          </Pressable>
        </View>
      </View>
  )
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    endNotice: {
      // `shadows.md` carries its own `elevation`, so it goes last rather than being overridden.
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      bottom: spacing.xl,
      zIndex: 9999,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.lg,
      backgroundColor: colors.bgElevated,
      ...shadows.md,
    },
    endNoticeBody: {
      flex: 1,
    },
    endNoticeText: {
      color: colors.textPrimary,
      fontSize: typography.md,
    },
    endNoticeDetail: {
      color: colors.textSecondary,
      fontSize: typography.xs,
      marginTop: 2,
    },
    container: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9999,
      elevation: 9999,
      backgroundColor: '#0b0e14',
      justifyContent: 'space-between',
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: Platform.OS === 'android' ? spacing.xl : 54,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: 'rgba(0, 194, 203, 0.12)',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.full,
    },
    badgeText: {
      color: colors.accentLight,
      fontSize: typography.xs,
      fontWeight: typography.medium,
    },
    timer: {
      color: colors.textPrimary,
      fontSize: typography.md,
      fontWeight: typography.semibold,
      fontFamily: typography.fontFamilyMono,
    },
    mainArea: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    audioStage: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    avatarWrapper: {
      padding: spacing.md,
      borderRadius: 999,
      backgroundColor: colors.accentGlow,
      marginBottom: spacing.xl,
      ...shadows.glow,
    },
    peerNameText: {
      color: colors.textPrimary,
      fontSize: typography.xxl,
      fontWeight: typography.bold,
      marginBottom: spacing.xs,
    },
    subStatus: {
      color: colors.textSecondary,
      fontSize: typography.sm,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    remoteMutedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.full,
      marginTop: spacing.sm,
    },
    remoteMutedText: {
      color: colors.warning,
      fontSize: typography.xs,
      fontWeight: typography.medium,
    },
    videoPermissionBtn: {
      position: 'absolute',
      bottom: spacing.lg,
      left: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radii.full,
    },
    permissionBtnText: {
      color: '#ffffff',
      fontSize: typography.sm,
      fontWeight: typography.medium,
    },
    videoStage: {
      flex: 1,
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
    },
    remoteVideoPlaceholder: {
      flex: 1,
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#111622',
      overflow: 'hidden',
    },
    pipContainer: {
      position: 'absolute',
      bottom: spacing.lg,
      right: spacing.lg,
      width: 120,
      height: 160,
      borderRadius: Platform.OS === 'android' ? 0 : radii.md,
      borderWidth: 2,
      borderColor: colors.accent,
      backgroundColor: '#000000',
    },
    cameraView: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    pipOff: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 4,
    },
    pipOffText: {
      color: '#94a3b8',
      fontSize: 10,
      textAlign: 'center',
    },
    pipOverlay: {
      position: 'absolute',
      bottom: 4,
      left: 6,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radii.sm,
    },
    pipLabel: {
      color: '#ffffff',
      fontSize: 10,
      fontWeight: typography.medium,
    },
    controlsBar: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.lg,
      paddingBottom: 48,
      paddingTop: spacing.lg,
      backgroundColor: 'rgba(14, 18, 26, 0.95)',
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    controlBtn: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.bgElevated,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    controlBtnActive: {
      backgroundColor: 'rgba(239, 68, 68, 0.18)',
      borderColor: colors.error,
    },
    hangupBtn: {
      backgroundColor: colors.error,
      borderColor: colors.error,
    },
    hangupIcon: {
      transform: [{ rotate: '135deg' }],
    },
  })
