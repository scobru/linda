import React, { useState, useRef, useMemo } from 'react'
import {
  View, TextInput, Pressable, Text, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import { Ionicons } from '@expo/vector-icons'
import { spacing, radii, typography, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

const THUMBNAIL_WIDTH = 360

/** Mirrors desktop's resizeImageToDataUrl (canvas-based) using expo-image-manipulator, the RN equivalent. */
async function makeThumbnail(uri: string): Promise<string | undefined> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: THUMBNAIL_WIDTH } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    )
    return result.base64 ? `data:image/jpeg;base64,${result.base64}` : undefined
  } catch {
    return undefined
  }
}

interface Props {
  onSend: (text: string) => void
  onAttach?: (name: string, mimeType: string, base64: string, thumbnail?: string) => void
  replyTo?: { id: string; body: string; authorName: string } | null
  editingMessage?: { id: string; body: string } | null
  onCancelReply?: () => void
  onCancelEdit?: () => void
  onSubmitEdit?: (id: string, body: string) => void
  onChangeText?: (text: string) => void
  disabled?: boolean
}

export default function MessageComposer({
  onSend, onAttach, replyTo, editingMessage, onCancelReply, onCancelEdit, onSubmitEdit, onChangeText, disabled,
}: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [text, setText] = useState(editingMessage?.body ?? '')
  const [attaching, setAttaching] = useState(false)
  const inputRef = useRef<TextInput>(null)

  // When editingMessage changes, update text
  React.useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.body)
      inputRef.current?.focus()
    }
  }, [editingMessage?.id])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return

    if (editingMessage) {
      onSubmitEdit?.(editingMessage.id, trimmed)
    } else {
      onSend(trimmed)
    }
    setText('')
  }

  const handleAttach = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
    const asset = result.assets?.[0]
    if (result.canceled || !asset) return
    setAttaching(true)
    try {
      const mimeType = asset.mimeType || 'application/octet-stream'
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 })
      const thumbnail = mimeType.startsWith('image/') ? await makeThumbnail(asset.uri) : undefined
      onAttach?.(asset.name, mimeType, base64, thumbnail)
    } finally {
      setAttaching(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Reply banner */}
      {replyTo && (
        <View style={styles.banner}>
          <View style={styles.bannerContent}>
            <Text style={styles.bannerLabel}>Replying to {replyTo.authorName}</Text>
            <Text style={styles.bannerPreview} numberOfLines={1}>{replyTo.body}</Text>
          </View>
          <Pressable onPress={onCancelReply} style={styles.bannerClose}>
            <Ionicons name="close" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}

      {/* Edit banner */}
      {editingMessage && (
        <View style={[styles.banner, styles.bannerEdit]}>
          <View style={styles.bannerContent}>
            <Text style={styles.bannerLabel}>Editing message</Text>
            <Text style={styles.bannerPreview} numberOfLines={1}>{editingMessage.body}</Text>
          </View>
          <Pressable onPress={onCancelEdit} style={styles.bannerClose}>
            <Ionicons name="close" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}

      {/* Input row */}
      <View style={styles.container}>
        {onAttach && !editingMessage && (
          <Pressable
            onPress={handleAttach}
            disabled={disabled || attaching}
            style={({ pressed }) => [styles.attachButton, pressed && styles.attachButtonPressed]}
          >
            {attaching ? <Text style={styles.attachIcon}>...</Text> : <Ionicons name="add" size={22} color={colors.textPrimary} />}
          </Pressable>
        )}
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={(t) => { setText(t); onChangeText?.(t) }}
          placeholder="Message"
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={4000}
          editable={!disabled}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <Pressable
          onPress={handleSend}
          disabled={disabled || text.trim().length === 0}
          style={({ pressed }) => [
            styles.sendButton,
            (disabled || text.trim().length === 0) && styles.sendButtonDisabled,
            pressed && styles.sendButtonPressed,
          ]}
        >
          <Ionicons name={editingMessage ? 'checkmark' : 'send'} size={16} color={text.trim().length > 0 ? '#061e27' : colors.textTertiary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: radii.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 6,
    color: colors.textPrimary,
    fontSize: typography.md,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'transparent',
    opacity: 0.3,
  },
  sendButtonPressed: {
    backgroundColor: colors.cyanLight,
    transform: [{ scale: 0.95 }],
  },
  sendIcon: {
    color: '#061e27',
    fontSize: 16,
    fontWeight: typography.bold,
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#20293a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachButtonPressed: {
    opacity: 0.5,
  },
  attachIcon: {
    fontSize: 20,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  bannerEdit: {
    borderLeftColor: colors.warning,
  },
  bannerContent: {
    flex: 1,
  },
  bannerLabel: {
    color: colors.accentLight,
    fontSize: typography.xs,
    fontWeight: typography.semibold,
  },
  bannerPreview: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    marginTop: 1,
  },
  bannerClose: {
    padding: spacing.sm,
  },
  bannerCloseText: {
    color: colors.textTertiary,
    fontSize: 16,
  },
})
