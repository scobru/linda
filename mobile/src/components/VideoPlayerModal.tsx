import React, { useMemo } from 'react'
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useVideoPlayer, VideoView } from 'expo-video'
import { spacing, typography, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

interface Props {
  /** Loopback URL from the worklet's media server — see SessionProxy.mediaUrl. */
  uri: string
  name: string
  onClose: () => void
}

/**
 * Mounted only while something is playing, so the player is created against a fresh source and
 * torn down with the modal. Playback is streamed: expo-video issues its own range requests
 * against the local server, so it starts on the first blocks rather than the whole file.
 */
export default function VideoPlayerModal({ uri, name, onClose }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const player = useVideoPlayer(uri, (p) => { p.play() })

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.bar}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>
        <VideoView style={styles.video} player={player} allowsFullscreen allowsPictureInPicture nativeControls />
      </View>
    </Modal>
  )
}

const createStyles = (_colors: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  name: { flex: 1, color: '#fff', fontSize: typography.sm },
  video: { flex: 1, width: '100%' },
})
