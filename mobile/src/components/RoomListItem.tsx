import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
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
          <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
            {name}
          </Text>
          {timestamp && timestamp > 0 && (
            <Text style={[styles.time, unread && styles.timeUnread]}>
              {formatRelativeTime(timestamp)}
            </Text>
          )}
        </View>
        {lastMessage && (
          <Text style={styles.preview} numberOfLines={1}>
            {lastMessage}
          </Text>
        )}
      </View>
      {unread && <View style={styles.badge} />}
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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.md,
    fontWeight: typography.medium,
    flex: 1,
  },
  nameUnread: {
    fontWeight: typography.bold,
  },
  time: {
    color: colors.textTertiary,
    fontSize: typography.xs,
    marginLeft: spacing.sm,
  },
  timeUnread: {
    color: colors.accent,
  },
  preview: {
    color: colors.textSecondary,
    fontSize: typography.sm,
  },
  badge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
})
