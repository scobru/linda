import React from 'react'
import { View, Text, StyleSheet, Pressable, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { spacing, radii, typography, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

interface Props {
  message: {
    id: string
    authorId: string
    body: string
    timestamp: number
    edited?: boolean
    deleted?: boolean
    reactions?: Record<string, string[]>
    replyTo?: string
    file?: { name: string; size: number; mimeType?: string; driveKey: string; path: string; thumbnail?: string }
  }
  isSelf: boolean
  authorName: string
  replyPreview?: string
  onLongPress?: () => void
  onReactionPress?: (emoji: string) => void
  onFilePress?: () => void
  fileDownloading?: boolean
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export default function ChatBubble({ message, isSelf, authorName, replyPreview, onLongPress, onReactionPress, onFilePress, fileDownloading }: Props) {
  const { colors } = useTheme()
  const styles = React.useMemo(() => createStyles(colors), [colors])
  if (message.deleted) {
    return (
      <View style={[styles.row, isSelf && styles.rowSelf]}>
        <View style={[styles.bubble, styles.deletedBubble, styles.deletedRow]}>
          <Ionicons name="trash-outline" size={13} color={colors.textTertiary} />
          <Text style={styles.deletedText}>Message deleted</Text>
        </View>
      </View>
    )
  }

  const hasReactions = message.reactions && Object.keys(message.reactions).length > 0

  return (
    <View style={[styles.row, isSelf && styles.rowSelf]}>
      <Pressable
        onLongPress={onLongPress}
        style={[
          styles.bubble,
          isSelf ? styles.bubbleSelf : styles.bubbleOther,
        ]}
      >
        {/* Author name (other's messages only) */}
        {!isSelf && (
          <Text style={styles.authorName}>{authorName}</Text>
        )}

        {/* Reply preview */}
        {replyPreview && (
          <View style={styles.replyBar}>
            <Text style={styles.replyText} numberOfLines={1}>
              {replyPreview}
            </Text>
          </View>
        )}

        {/* File attachment */}
        {message.file && (
          message.file.thumbnail ? (
            <Pressable onPress={onFilePress} disabled={fileDownloading} style={styles.imageAttachment}>
              <Image source={{ uri: message.file.thumbnail }} style={styles.imageThumb} resizeMode="cover" />
              {fileDownloading && (
                <View style={styles.imageOverlay}>
                  <Text style={styles.fileSize}>Downloading…</Text>
                </View>
              )}
            </Pressable>
          ) : (
            <Pressable style={styles.fileAttachment} onPress={onFilePress} disabled={fileDownloading}>
              <View style={styles.fileNameRow}>
                <Ionicons name="attach-outline" size={13} color={colors.textPrimary} />
                <Text style={styles.fileName}>{message.file.name}</Text>
              </View>
              <Text style={styles.fileSize}>
                {fileDownloading ? 'Downloading…' : formatFileSize(message.file.size)}
              </Text>
            </Pressable>
          )
        )}

        {/* Message body */}
        {message.body.trim() !== '' && (
          <Text style={[styles.body, isSelf ? styles.bodySelf : styles.bodyOther]}>
            {message.body}
          </Text>
        )}

        {/* Meta row: time + edited */}
        <View style={styles.metaRow}>
          {message.edited && (
            <Text style={[styles.meta, isSelf ? styles.metaSelf : null]}>edited</Text>
          )}
          <Text style={[styles.meta, isSelf ? styles.metaSelf : null]}>
            {formatTime(message.timestamp)}
          </Text>
        </View>
      </Pressable>

      {/* Reactions */}
      {hasReactions && (
        <View style={[styles.reactions, isSelf && styles.reactionsSelf]}>
          {Object.entries(message.reactions!).map(([emoji, users]) => (
            <Pressable
              key={emoji}
              onPress={() => onReactionPress?.(emoji)}
              style={[
                styles.reactionChip,
                users.length > 0 && styles.reactionChipActive,
              ]}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              <Text style={styles.reactionCount}>{users.length}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.lg,
    alignItems: 'flex-start',
  },
  rowSelf: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
  },
  bubbleSelf: {
    backgroundColor: colors.bubbleSelf,
    borderBottomRightRadius: radii.sm,
  },
  bubbleOther: {
    backgroundColor: colors.bubbleOther,
    borderBottomLeftRadius: radii.sm,
  },
  deletedBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
  },
  deletedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  deletedText: {
    color: colors.textTertiary,
    fontSize: typography.sm,
    fontStyle: 'italic',
  },
  authorName: {
    color: colors.accentLight,
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    marginBottom: 2,
  },
  replyBar: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accentLight,
    paddingLeft: spacing.sm,
    marginBottom: spacing.xs,
    opacity: 0.7,
  },
  replyText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
  },
  fileAttachment: {
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  imageAttachment: {
    marginBottom: spacing.xs,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  imageThumb: {
    width: 220,
    height: 220,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fileName: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: typography.medium,
  },
  fileSize: {
    color: colors.textTertiary,
    fontSize: typography.xs,
    marginTop: 2,
  },
  body: {
    fontSize: typography.md,
    lineHeight: 20,
  },
  bodySelf: {
    color: colors.bubbleSelfText,
  },
  bodyOther: {
    color: colors.bubbleOtherText,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  meta: {
    color: colors.textTertiary,
    fontSize: 10,
  },
  metaSelf: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 2,
    paddingLeft: spacing.xs,
  },
  reactionsSelf: {
    justifyContent: 'flex-end',
    paddingLeft: 0,
    paddingRight: spacing.xs,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    gap: 2,
  },
  reactionChipActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    color: colors.textSecondary,
    fontSize: 11,
  },
})
