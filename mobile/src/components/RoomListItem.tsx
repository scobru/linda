import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { spacing, radii, typography, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'
import Avatar from './Avatar'

interface Props {
  id: string
  name: string
  lastMessage?: string
  timestamp?: number
  unread?: boolean
  avatar?: string
  onPress: () => void
  onLongPress?: () => void
}

function formatRelativeTime(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}

export default function RoomListItem({ id, name, lastMessage, timestamp, unread, avatar, onPress, onLongPress }: Props) {
  const { colors } = useTheme()
  const styles = React.useMemo(() => createStyles(colors), [colors])
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
    >
      <Avatar id={id} label={name} imageUrl={avatar} size="lg" />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
              {name}
            </Text>
            <Ionicons name="checkmark-circle" size={14} color="#38bdf8" style={styles.verifiedIcon} />
          </View>
          {timestamp && timestamp > 0 && (
            <Text style={[styles.time, unread && styles.timeUnread]}>
              {formatRelativeTime(timestamp)}
            </Text>
          )}
        </View>
        <View style={styles.bottomRow}>
          {lastMessage ? (
            <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
              {lastMessage}
            </Text>
          ) : (
            <Text style={styles.previewEmpty} numberOfLines={1}>
              E2E Sovereign Room
            </Text>
          )}
          {unread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>1</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.sm,
    borderRadius: radii.lg,
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.bgHover,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.md,
    fontWeight: typography.semibold,
  },
  nameUnread: {
    fontWeight: typography.bold,
  },
  verifiedIcon: {
    marginTop: 1,
  },
  time: {
    color: colors.textTertiary,
    fontSize: typography.xs,
    marginLeft: spacing.sm,
  },
  timeUnread: {
    color: colors.cyan,
    fontWeight: typography.semibold,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  preview: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    flex: 1,
  },
  previewUnread: {
    color: colors.textPrimary,
    fontWeight: typography.medium,
  },
  previewEmpty: {
    color: colors.textTertiary,
    fontSize: typography.xs,
    fontStyle: 'italic',
    flex: 1,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: radii.full,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#061e27',
    fontSize: 10,
    fontWeight: '700',
  },
})
