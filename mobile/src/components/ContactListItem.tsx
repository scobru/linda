import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { spacing, radii, typography, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'
import Avatar from './Avatar'

interface Props {
  userId: string
  nickname: string
  status: 'incoming' | 'outgoing' | 'accepted'
  avatar?: string
  online?: boolean
  onAccept?: () => void
  onDecline?: () => void
  onRemove?: () => void
  onPress?: () => void
}

const STATUS_LABELS = {
  incoming: 'wants to connect',
  outgoing: 'request sent',
  accepted: '',
}

export default function ContactListItem({
  userId, nickname, status, avatar, online, onAccept, onDecline, onRemove, onPress,
}: Props) {
  const { colors } = useTheme()
  const styles = React.useMemo(() => createStyles(colors), [colors])
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
    >
      <Avatar id={userId} label={nickname} imageUrl={avatar} size="lg" online={online} />
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{nickname || userId.slice(0, 8)}</Text>
        {STATUS_LABELS[status] !== '' && (
          <Text style={styles.status}>{STATUS_LABELS[status]}</Text>
        )}
      </View>

      {status === 'incoming' && (
        <View style={styles.actions}>
          <Pressable onPress={onAccept} style={[styles.actionBtn, styles.acceptBtn]}>
            <Ionicons name="checkmark" size={16} color="#ffffff" />
          </Pressable>
          <Pressable onPress={onDecline} style={[styles.actionBtn, styles.declineBtn]}>
            <Ionicons name="close" size={16} color="#ffffff" />
          </Pressable>
        </View>
      )}

      {status === 'accepted' && onRemove && (
        <Pressable onPress={onRemove} style={styles.removeBtn}>
          <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
        </Pressable>
      )}

      {status === 'outgoing' && (
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingText}>pending</Text>
        </View>
      )}
    </Pressable>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.bgHover,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.md,
    fontWeight: typography.medium,
  },
  status: {
    color: colors.textTertiary,
    fontSize: typography.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    backgroundColor: colors.success,
  },
  declineBtn: {
    backgroundColor: colors.error,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: typography.bold,
  },
  removeBtn: {
    padding: spacing.sm,
  },
  pendingBadge: {
    backgroundColor: colors.bgTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  pendingText: {
    color: colors.textTertiary,
    fontSize: typography.xs,
  },
})
