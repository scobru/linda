import React, { useMemo, useEffect, useRef } from 'react'
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  StatusBar
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSession } from '../hooks/useSession'
import { useTheme } from '../theme-context'
import { spacing, typography, radii, shadows, type ThemeColors } from '../theme'
import Avatar from './Avatar'

export default function IncomingCallModal() {
  const { incomingCall, answerCall, nicknames, avatars } = useSession()
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  // Pulsing animation for the ring
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (incomingCall) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      )
      loop.start()
      return () => loop.stop()
    }
  }, [incomingCall, pulseAnim])

  if (!incomingCall || incomingCall.state !== 'ringing') {
    return null
  }

  const callerName = nicknames.get(incomingCall.peerId) || 'Linda Contact'
  const callerAvatar = avatars.get(incomingCall.peerId)
  const isVideo = incomingCall.media.video

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => {
        void answerCall(incomingCall.callId, false)
      }}
    >
      <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.85)" />
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header badge */}
          <View style={styles.badge}>
            <Ionicons name="shield-checkmark" size={14} color={colors.accentLight} />
            <Text style={styles.badgeText}>Linda P2P Encrypted Call</Text>
          </View>

          {/* Caller info */}
          <View style={styles.callerContainer}>
            <Animated.View style={[styles.avatarGlow, { transform: [{ scale: pulseAnim }] }]}>
              <Avatar
                id={incomingCall.peerId}
                label={callerName}
                imageUrl={callerAvatar}
                size="xl"
              />
            </Animated.View>
            <Text style={styles.callerName} numberOfLines={1}>{callerName}</Text>
            <Text style={styles.callType}>
              {isVideo ? 'Incoming Video Call...' : 'Incoming Audio Call...'}
            </Text>
            <Text style={styles.p2pNote}>Direct Hyperswarm Holepunch</Text>
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            {/* Decline */}
            <View style={styles.buttonWrapper}>
              <Pressable
                style={[styles.btn, styles.btnDecline]}
                onPress={() => {
                  void answerCall(incomingCall.callId, false)
                }}
                hitSlop={10}
              >
                <Ionicons name="close" size={28} color="#ffffff" />
              </Pressable>
              <Text style={styles.btnLabel}>Decline</Text>
            </View>

            {/* Accept */}
            <View style={styles.buttonWrapper}>
              <Pressable
                style={[styles.btn, styles.btnAccept]}
                onPress={() => {
                  void answerCall(incomingCall.callId, true)
                }}
                hitSlop={10}
              >
                <Ionicons name={isVideo ? 'videocam' : 'call'} size={28} color="#ffffff" />
              </Pressable>
              <Text style={styles.btnLabel}>Accept</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(10, 14, 23, 0.88)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.bgElevated,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: spacing.xxl,
      alignItems: 'center',
      ...shadows.glow,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.cyanDim,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.full,
      marginBottom: spacing.xxl,
    },
    badgeText: {
      color: colors.accentLight,
      fontSize: typography.xs,
      fontWeight: typography.medium,
    },
    callerContainer: {
      alignItems: 'center',
      marginBottom: spacing.xxxl,
    },
    avatarGlow: {
      padding: spacing.sm,
      borderRadius: 999,
      backgroundColor: colors.accentGlow,
      marginBottom: spacing.lg,
    },
    callerName: {
      color: colors.textPrimary,
      fontSize: typography.xxl,
      fontWeight: typography.bold,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    callType: {
      color: colors.accentLight,
      fontSize: typography.md,
      fontWeight: typography.medium,
      marginBottom: spacing.xs,
    },
    p2pNote: {
      color: colors.textTertiary,
      fontSize: typography.xs,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
      paddingHorizontal: spacing.lg,
    },
    buttonWrapper: {
      alignItems: 'center',
      gap: spacing.sm,
    },
    btn: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: 'center',
      alignItems: 'center',
      ...shadows.md,
    },
    btnDecline: {
      backgroundColor: colors.error,
    },
    btnAccept: {
      backgroundColor: colors.success,
    },
    btnLabel: {
      color: colors.textSecondary,
      fontSize: typography.sm,
      fontWeight: typography.medium,
    },
  })
