import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, Pressable, StyleSheet, SafeAreaView,
  Share, Alert,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation'
import { useSession } from '../hooks/useSession'
import { encodeInvite, type RoomInvite } from '@core/ui/qr-core'
import { spacing, radii, typography, shadows, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

// Conditional imports — these are RN-only packages
let QRCodeSvg: any = null
try { QRCodeSvg = require('react-native-qrcode-svg').default } catch {}

type Props = NativeStackScreenProps<RootStackParamList, 'Invite'>

export default function InviteScreen({ route }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { roomId, roomName, contact } = route.params
  const { session, identity, nickname } = useSession()
  const [inviteLink, setInviteLink] = useState('')
  const title = contact ? 'Invite Someone to Chat' : `Invite to ${roomName ?? 'Room'}`

  useEffect(() => {
    if (!session) return
    void (async () => {
      try {
        // Contact mode has no room yet — creating one is what produces the link.
        if (contact) {
          if (!identity) return
          const { key } = await session.createContactInvite()
          const invite: RoomInvite = {
            kind: 'contact',
            name: nickname || identity.id.slice(0, 8),
            key,
            from: identity.id,
          }
          setInviteLink(encodeInvite(invite))
          return
        }
        if (!roomId) return
        const link = await session.inviteLinkFor(roomId)
        const invite: RoomInvite = { name: roomName ?? 'Room', key: link }
        setInviteLink(encodeInvite(invite))
      } catch (err) {
        Alert.alert('Error', (err as Error).message)
      }
    })()
  }, [session, roomId, roomName, contact, identity, nickname])

  const handleShare = useCallback(async () => {
    if (!inviteLink) return
    try {
      await Share.share({ message: inviteLink })
    } catch {}
  }, [inviteLink])

  const handleCopy = useCallback(async () => {
    if (!inviteLink) return
    await Clipboard.setStringAsync(inviteLink)
  }, [inviteLink])

  const handleRegenerate = useCallback(() => {
    if (!session || !roomId) return
    Alert.alert(
      'Regenerate invite?',
      'The current invite link will stop working.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          onPress: () => {
            void session.regenerateInvite(roomId).then((link) => {
              const invite: RoomInvite = { name: roomName ?? 'Room', key: link }
              setInviteLink(encodeInvite(invite))
            })
          },
        },
      ]
    )
  }, [session, roomId, roomName])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {contact
            ? 'Send this to one person, through any app. Opening it puts the two of you straight into a private chat — they do not need to be online now. It works once.'
            : 'Share this QR code or link to invite others'}
        </Text>

        {/* QR Code */}
        <View style={styles.qrContainer}>
          {inviteLink && QRCodeSvg ? (
            <QRCodeSvg
              value={inviteLink}
              size={200}
              backgroundColor={colors.bgPrimary}
              color={colors.textPrimary}
            />
          ) : (
            <View style={styles.qrPlaceholder}>
              <Text style={styles.qrPlaceholderText}>
                {inviteLink ? 'QR rendering unavailable' : 'Generating...'}
              </Text>
            </View>
          )}
        </View>

        {/* Invite link */}
        <Pressable style={styles.linkBox} onPress={handleCopy} disabled={!inviteLink}>
          <Text style={styles.linkText} numberOfLines={3} selectable>
            {inviteLink || 'Generating invite link...'}
          </Text>
          <View style={styles.copyHint}>
            <Ionicons name="copy-outline" size={12} color={colors.textTertiary} />
            <Text style={styles.copyHintText}>Tap to copy</Text>
          </View>
        </Pressable>

        {/* Actions */}
        <Pressable
          onPress={handleShare}
          disabled={!inviteLink}
          style={({ pressed }) => [
            styles.shareBtn,
            pressed && styles.shareBtnPressed,
          ]}
        >
          <View style={styles.btnRow}>
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={styles.shareBtnText}>Share Invite</Text>
          </View>
        </Pressable>

        {/* A contact link bakes in the invite code that was current when it was generated, so
            rotating the code would only break the link already sent, not replace it. */}
        {!contact && (
          <Pressable onPress={handleRegenerate} style={styles.regenBtn}>
            <View style={styles.btnRow}>
              <Ionicons name="refresh-outline" size={16} color={colors.textTertiary} />
              <Text style={styles.regenText}>Regenerate Link</Text>
            </View>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  container: { flex: 1, alignItems: 'center', padding: spacing.xxl, justifyContent: 'center' },
  title: {
    fontSize: typography.xl, fontWeight: typography.bold,
    color: colors.textPrimary, marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.md, color: colors.textSecondary,
    textAlign: 'center', marginBottom: spacing.xxxl,
  },
  qrContainer: {
    padding: spacing.xl, backgroundColor: colors.surface,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.xxl,
  },
  qrPlaceholder: {
    width: 200, height: 200, alignItems: 'center', justifyContent: 'center',
  },
  qrPlaceholderText: { color: colors.textTertiary },
  linkBox: {
    backgroundColor: colors.surface, borderRadius: radii.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.xxl, width: '100%',
  },
  linkText: {
    color: colors.textSecondary, fontSize: typography.xs,
    fontFamily: 'monospace', textAlign: 'center',
  },
  copyHint: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, marginTop: spacing.sm,
  },
  copyHintText: { color: colors.textTertiary, fontSize: typography.xs },
  shareBtn: {
    backgroundColor: colors.accent, borderRadius: radii.md,
    paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xxxl,
    ...shadows.glow, width: '100%', alignItems: 'center',
  },
  shareBtnPressed: { backgroundColor: colors.accentDark, transform: [{ scale: 0.98 }] },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  shareBtnText: { color: '#fff', fontSize: typography.md, fontWeight: typography.semibold },
  regenBtn: {
    marginTop: spacing.lg, paddingVertical: spacing.sm,
  },
  regenText: { color: colors.textTertiary, fontSize: typography.sm },
})
