import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Platform,
  Image
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera'
import { requestRecordingPermissionsAsync } from 'expo-audio'
import { bareClient } from '../bare/client'
import { frameDataUri, VIDEO_FRAME, AUDIO_FRAME, type WireMediaFrame } from '../bare/media-frame'
import { callAudio } from '../call-audio'
import { MediaBackpressure } from '@core/call/media-backpressure'
import { useSession } from '../hooks/useSession'
import { useTheme } from '../theme-context'
import { spacing, typography, radii, shadows, type ThemeColors } from '../theme'
import Avatar from './Avatar'
import { formatCallDuration } from '@core/util/duration'

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
    sendCallFrame
  } = useSession()

  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [facing, setFacing] = useState<CameraType>('front')
  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)

  const isConnected = activeCall?.state === 'connected'
  const isVideo = activeCall?.media.video

  const [remoteVideoFrame, setRemoteVideoFrame] = useState<string | null>(null)
  const isCameraReadyRef = useRef(false)
  const lastFrameTimeRef = useRef(0)
  // A ref, not state: this gates a `setInterval` and must never cause a re-render of a screen that
  // is already rendering video frames.
  const backpressureRef = useRef(new MediaBackpressure())

  // What the wire says it can carry. Every JPEG this screen sends costs a base64 encode, a JSON
  // stringify and a trip across the bridge before it even reaches the socket, so a frame the wire
  // cannot take yet is worth more here than on the desktop.
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

    void requestRecordingPermissionsAsync()
      .then((perm) => {
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
      sendCallFrame({
        kind: AUDIO_FRAME,
        payload: base64Chunk,
        keyframe: true
      })
    })

    return () => {
      unsubMedia()
      unsubCapture()
      callAudio.stopAll()
    }
  }, [isConnected, sendCallFrame])

  // Periodic video frame capture & transmission from mobile camera
  useEffect(() => {
    if (!isConnected || !isVideo || isCallVideoOff || !permission?.granted) return
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
          shutterSound: false,
          skipProcessing: true
        })
        consecutiveErrors = 0
        if (isMounted && pic?.base64) {
          sendCallFrame({
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
  }, [isConnected, isVideo, isCallVideoOff, permission?.granted, sendCallFrame])

  const isVisible = Boolean(activeCall && activeCall.state !== 'idle' && activeCall.state !== 'ended')
  const peerId = activeCall?.peerId ?? ''
  const callId = activeCall?.callId ?? ''
  const peerName = (peerId ? nicknames.get(peerId) : null) || 'Linda Contact'
  const peerAvatar = peerId ? avatars.get(peerId) : undefined
  const remoteMuted = Boolean(activeCall?.remoteMuted)
  const remoteCameraOff = Boolean(activeCall?.remoteCameraOff)

  const toggleFacing = () => {
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'))
  }

  const statusLabel = isConnected
    ? formatCallDuration(callDuration)
    : activeCall?.state === 'ringing'
      ? 'Ringing...'
      : 'Calling...'

  return (
    <Modal
      visible={isVisible}
      animationType="fade"
      onRequestClose={() => {
        if (callId) {
          void endCall(callId)
        }
      }}
    >
      <View style={styles.container}>
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
          {isVisible && isVideo && !isCallVideoOff && permission?.granted ? (
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
                  onCameraReady={() => {
                    isCameraReadyRef.current = true
                  }}
                />
                <View style={styles.pipOverlay}>
                  <Text style={styles.pipLabel}>You</Text>
                </View>
              </View>
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
                  ? (isVideo ? 'Camera disabled' : '16 kHz HD Audio Stream')
                  : 'Ringing remote peer...'}
              </Text>
              {remoteMuted && (
                <View style={styles.remoteMutedPill}>
                  <Ionicons name="mic-off" size={14} color={colors.warning} />
                  <Text style={styles.remoteMutedText}>Peer is muted</Text>
                </View>
              )}

              {/* Ask camera permission button if needed */}
              {isVideo && !permission?.granted && (
                <Pressable
                  style={styles.permissionBtn}
                  onPress={() => {
                    void requestPermission()
                  }}
                >
                  <Ionicons name="camera-outline" size={16} color="#ffffff" />
                  <Text style={styles.permissionBtnText}>Enable Camera</Text>
                </Pressable>
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
    </Modal>
  )
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
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
    permissionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radii.full,
      marginTop: spacing.lg,
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
      borderRadius: radii.md,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: colors.accent,
      ...shadows.lg,
      backgroundColor: '#000000',
    },
    cameraView: {
      flex: 1,
      width: '100%',
      height: '100%',
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
