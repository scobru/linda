import React, { useState, useRef, useMemo, useEffect } from 'react'
import {
  View, TextInput, Pressable, Text, StyleSheet,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import * as VideoThumbnails from 'expo-video-thumbnails'
import {
  useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio'
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

/**
 * Poster frame for a video, resized through the same path as an image thumbnail so both travel
 * as one small data URL in the message.
 *
 * Grabbed a second in rather than at frame zero: recordings very often open on a black frame,
 * which would make every video look like a broken image in the chat.
 */
async function makeVideoPoster(uri: string): Promise<string | undefined> {
  try {
    const { uri: frame } = await VideoThumbnails.getThumbnailAsync(uri, { time: 1000, quality: 0.7 })
    return await makeThumbnail(frame)
  } catch {
    // Codecs this device cannot decode, and video too short to seek into, both land here; the
    // message still sends, just without a poster.
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
}

export default function MessageComposer({
  onSend, onAttach, replyTo, editingMessage, onCancelReply, onCancelEdit, onSubmitEdit, onChangeText,
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

  // Voice messages ride the same path as any other attachment — the receiving side already
  // recognises audio by extension and renders a player for it (see ChatBubble's isAudioFile).
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)

  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [recording])

  const startRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Microphone blocked', 'Allow microphone access to record a voice message.')
        return
      }
      // Without this the recorder is silent on iOS, where capture is off by default.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      recorder.record()
      setRecordSeconds(0)
      setRecording(true)
    } catch (err) {
      Alert.alert('Could not start recording', (err as Error).message)
    }
  }

  const stopRecording = async (send: boolean) => {
    setRecording(false)
    try {
      await recorder.stop()
      // Restores playback routing — left on, the earpiece stays selected and playback is quiet.
      await setAudioModeAsync({ allowsRecording: false })
      const uri = recorder.uri
      if (!send || !uri) return
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
      const name = `voice-${new Date().toISOString().replace(/[:.]/g, '-')}.m4a`
      onAttach?.(name, 'audio/m4a', base64)
    } catch (err) {
      Alert.alert('Could not save recording', (err as Error).message)
    }
  }

  const handleAttach = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
    const asset = result.assets?.[0]
    if (result.canceled || !asset) return
    setAttaching(true)
    try {
      const mimeType = asset.mimeType || 'application/octet-stream'
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 })
      const thumbnail = mimeType.startsWith('image/')
        ? await makeThumbnail(asset.uri)
        : mimeType.startsWith('video/')
          ? await makeVideoPoster(asset.uri)
          : undefined
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

      {/* Recording row — replaces the composer while a voice message is being captured */}
      {recording ? (
        <View style={styles.container}>
          <Pressable onPress={() => void stopRecording(false)} style={styles.attachButton}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
          <View style={styles.recordingStatus}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>
              Recording  {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}
            </Text>
          </View>
          <Pressable onPress={() => void stopRecording(true)} style={[styles.sendButton, styles.sendButtonPressed]}>
            <Ionicons name="send" size={16} color="#061e27" />
          </Pressable>
        </View>
      ) : (
      /* Input row */
      <View style={styles.container}>
        {onAttach && !editingMessage && (
          <Pressable
            onPress={handleAttach}
            disabled={attaching}
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
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        {/* With nothing typed the send button has nothing to do, so it becomes the mic. */}
        {onAttach && !editingMessage && text.trim().length === 0 ? (
          <Pressable
            onPress={() => void startRecording()}
            style={({ pressed }) => [styles.sendButton, styles.sendButtonDisabled, pressed && styles.sendButtonPressed]}
          >
            <Ionicons name="mic" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : (
        <Pressable
          onPress={handleSend}
          disabled={text.trim().length === 0}
          style={({ pressed }) => [
            styles.sendButton,
            text.trim().length === 0 && styles.sendButtonDisabled,
            pressed && styles.sendButtonPressed,
          ]}
        >
          <Ionicons name={editingMessage ? 'checkmark' : 'send'} size={16} color={text.trim().length > 0 ? '#061e27' : colors.textTertiary} />
        </Pressable>
        )}
      </View>
      )}
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
  recordingStatus: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.inputBg,
    borderRadius: radii.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  recordingDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.error,
  },
  recordingText: {
    color: colors.textSecondary,
    fontSize: typography.md,
    fontVariant: ['tabular-nums'],
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
    // Was a hardcoded dark navy — in light mode that left a near-invisible dark icon
    // (colors.textPrimary, near-black in light mode) sitting on an equally dark button.
    backgroundColor: colors.bgTertiary,
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
