import React, { useState, useCallback, useMemo, useEffect } from 'react'
import {
  View, Text, TextInput, Pressable, Switch, StyleSheet,
  SafeAreaView, ScrollView, Alert, DevSettings, Linking,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as DocumentPicker from 'expo-document-picker'
import { squareImageToDataUri } from '../avatar-image'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation'
import { useSession } from '../hooks/useSession'
import { SvgXml } from 'react-native-svg'
import { WALLPAPERS, wallpaperPatternSvg, DEFAULT_WALLPAPER } from '@core/ui/wallpapers'
import { revealSecretKey, revealMnemonic, resetDevice, unlockIdentity } from '../bare/identity-client'
import { storageDir } from '../bare/storage-dir'
import { isBiometricSupported, isBiometricLockEnabled, enableBiometricLock, disableBiometricLock } from '../bare/biometric-lock'
import Avatar from '../components/Avatar'
import { spacing, radii, typography, shadows, PRESET_AVATARS, type ThemeColors } from '../theme'
import { useTheme, type ThemeMode } from '../theme-context'
import { usePrivateMode } from '../private-mode'
import { formatBytes } from '@core/util/bytes'
import { APP_VERSION } from '@core/version'

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
]

export default function ProfileScreen({ navigation }: Props) {
  const { colors, mode, setMode } = useTheme()
  const { privateMode, setPrivateMode } = usePrivateMode()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { session, identity, nickname, avatar, refresh, onlineUsers } = useSession()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(nickname)
  const [showAvatars, setShowAvatars] = useState(false)
  const [secretKey, setSecretKey] = useState<string | null>(null)
  const [mnemonic, setMnemonic] = useState<string | null>(null)
  const [mnemonicPass, setMnemonicPass] = useState('')
  const [biometricSupported, setBiometricSupported] = useState(false)
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [biometricPromptPass, setBiometricPromptPass] = useState<string | null>(null)

  useEffect(() => {
    void isBiometricSupported().then(setBiometricSupported)
    void isBiometricLockEnabled().then(setBiometricEnabled)
  }, [])

  const handleSaveName = useCallback(async () => {
    if (!session) return
    await session.setNickname(nameValue.trim())
    refresh()
    setEditingName(false)
  }, [session, nameValue, refresh])

  const handleSelectAvatar = useCallback(async (avatarSvg: string) => {
    if (!session) return
    await session.setAvatar(avatarSvg)
    refresh()
    setShowAvatars(false)
  }, [session, refresh])

  const handleUploadPhoto = useCallback(async () => {
    if (!session) return
    const result = await DocumentPicker.getDocumentAsync({ type: 'image/*' })
    if (result.canceled) return
    const asset = result.assets[0]
    if (!asset) return
    try {
      await session.setAvatar(await squareImageToDataUri(asset.uri))
      refresh()
    } catch (err) {
      Alert.alert('Error', (err as Error).message || 'Could not load image')
    }
  }, [session, refresh])

  const handleToggleSecretKey = useCallback(async () => {
    if (secretKey) { setSecretKey(null); return }
    try {
      setSecretKey(await revealSecretKey())
    } catch (err) {
      Alert.alert('Error', (err as Error).message)
    }
  }, [secretKey])

  const handleToggleBiometric = useCallback((value: boolean) => {
    if (value) {
      setBiometricPromptPass('')
    } else {
      void disableBiometricLock().then(() => setBiometricEnabled(false))
    }
  }, [])

  const handleConfirmEnableBiometric = useCallback(async () => {
    if (!biometricPromptPass) return
    try {
      await unlockIdentity(biometricPromptPass, storageDir())
      await enableBiometricLock(biometricPromptPass)
      setBiometricEnabled(true)
      setBiometricPromptPass(null)
    } catch (err) {
      Alert.alert('Error', (err as Error).message)
    }
  }, [biometricPromptPass])

  const handleRevealMnemonic = useCallback(async () => {
    if (mnemonic) { setMnemonic(null); setMnemonicPass(''); return }
    try {
      const words = await revealMnemonic(mnemonicPass, storageDir())
      if (!words) { Alert.alert('No recovery phrase', 'This identity was added via device pairing and never had one.'); return }
      setMnemonic(words)
    } catch (err) {
      Alert.alert('Error', (err as Error).message)
    }
  }, [mnemonic, mnemonicPass])

  const handleCopy = useCallback(async (text: string, label: string) => {
    await Clipboard.setStringAsync(text)
    Alert.alert('Copied', `${label} copied to clipboard`)
  }, [])

  const [wallpaper, setWallpaper] = useState('')

  useEffect(() => {
    if (!session) return
    void session.getWallpaper().then(setWallpaper).catch(() => {})
  }, [session])

  const handleSelectWallpaper = useCallback((id: string) => {
    if (!session) return
    setWallpaper(id)
    void session.setWallpaper(id).catch((err) => Alert.alert('Error', (err as Error).message))
  }, [session])

  // Counts before deleting and names what would go: removing blobs cannot be undone.
  const handleSweepOrphans = useCallback(async () => {
    if (!session) return
    try {
      const orphans = await session.findOrphanBlobs()
      if (orphans.length === 0) {
        Alert.alert('Nothing to clean up', 'Every file on your drive is still referenced by a room.')
        return
      }
      const total = orphans.reduce((sum, o) => sum + o.bytes, 0)
      Alert.alert(
        `Delete ${orphans.length} orphaned file(s)?`,
        `This frees ${formatBytes(total)} on this device. They are files no room points at any more. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void session.deleteBlobs(orphans.map((o) => o.path))
                .then((deleted) => Alert.alert('Done', `Removed ${deleted} file(s), freeing ${formatBytes(total)}.`))
                .catch((err) => Alert.alert('Cleanup failed', (err as Error).message))
            },
          },
        ]
      )
    } catch (err) {
      Alert.alert('Cleanup failed', (err as Error).message)
    }
  }, [session])

  const handleResetDevice = useCallback(() => {
    Alert.alert(
      'Reset this device?',
      'This permanently deletes your local identity, rooms and contacts on this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetDevice(storageDir())
              DevSettings.reload()
            } catch (err) {
              Alert.alert('Error', (err as Error).message)
            }
          },
        },
      ]
    )
  }, [])

  const publicKeyShort = identity ? identity.id.slice(0, 16) + '...' + identity.id.slice(-8) : ''

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <Pressable onPress={() => setShowAvatars(!showAvatars)}>
            <Avatar id={identity?.id || ''} label={nickname} imageUrl={avatar} size="xl" />
            <View style={styles.editBadge}>
              <Ionicons name="pencil" size={12} color="#fff" />
            </View>
          </Pressable>
        </View>

        {/* Avatar picker */}
        {showAvatars && (
          <View style={styles.avatarPicker}>
            <Pressable onPress={handleUploadPhoto} style={[styles.uploadBtn, styles.rowCenter]}>
              <Ionicons name="camera-outline" size={16} color={colors.accentLight} />
              <Text style={styles.uploadBtnText}>Upload Custom Picture</Text>
            </Pressable>
            <Text style={styles.sectionTitle}>Choose Avatar</Text>
            <View style={styles.avatarGrid}>
              {PRESET_AVATARS.map((preset) => (
                <Pressable
                  key={preset.id}
                  onPress={() => handleSelectAvatar(preset.svg)}
                  style={({ pressed }) => [
                    styles.presetBtn,
                    pressed && styles.presetPressed,
                  ]}
                >
                  <Avatar id={preset.id} label={preset.name} imageUrl={preset.svg} size="lg" />
                  <Text style={styles.presetName}>{preset.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Nickname */}
        <View style={styles.field}>
          <Text style={styles.label}>Nickname</Text>
          {editingName ? (
            <View style={styles.editRow}>
              <TextInput
                style={styles.editInput}
                value={nameValue}
                onChangeText={setNameValue}
                autoFocus
                onSubmitEditing={handleSaveName}
              />
              <Pressable onPress={handleSaveName} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => { setNameValue(nickname); setEditingName(true) }}>
              <View style={styles.valueRow}>
                <Text style={styles.value}>{nickname || 'Not set'}</Text>
                <Ionicons name="pencil-outline" size={16} color={colors.textTertiary} />
              </View>
            </Pressable>
          )}
        </View>

        {/* Sovereign Keys */}
        <View style={styles.field}>
          <Text style={styles.label}>Public Key</Text>
          <Pressable onPress={() => identity && handleCopy(identity.id, 'Public key')} style={styles.keyRow}>
            <Text style={styles.mono} numberOfLines={1}>{publicKeyShort}</Text>
            <Ionicons name="copy-outline" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Secret Key</Text>
          <Pressable onPress={handleToggleSecretKey} style={styles.keyRow}>
            <Text style={styles.mono} numberOfLines={1}>{secretKey || '•'.repeat(24)}</Text>
            <Ionicons name={secretKey ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textTertiary} />
          </Pressable>
          {secretKey && (
            <Pressable onPress={() => handleCopy(secretKey, 'Secret key')} style={styles.copySecretBtn}>
              <Text style={styles.copySecretText}>Copy secret key</Text>
            </Pressable>
          )}
        </View>

        {/* Recovery phrase */}
        <View style={styles.field}>
          <Text style={styles.label}>Recovery Phrase</Text>
          {mnemonic ? (
            <>
              <View style={styles.mnemonicGrid}>
                {mnemonic.split(' ').map((word, i) => (
                  <View key={i} style={styles.mnemonicWord}>
                    <Text style={styles.mnemonicIndex}>{i + 1}</Text>
                    <Text style={styles.mnemonicText}>{word}</Text>
                  </View>
                ))}
              </View>
              <Pressable onPress={handleRevealMnemonic} style={styles.copySecretBtn}>
                <Text style={styles.copySecretText}>Hide</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.editRow}>
              <TextInput
                style={styles.editInput}
                placeholder="Passphrase to reveal"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                value={mnemonicPass}
                onChangeText={setMnemonicPass}
                onSubmitEditing={handleRevealMnemonic}
              />
              <Pressable onPress={handleRevealMnemonic} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Reveal</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Private mode — the switch the desktop keeps in its profile drawer. */}
        <View style={styles.field}>
          <View style={styles.valueRow}>
            <Text style={[styles.label, styles.labelInline]}>Private Mode</Text>
            <Switch value={privateMode} onValueChange={setPrivateMode} />
          </View>
          <Text style={styles.fieldHint}>
            Hides message text, chat previews and notification content, so you can hand someone your
            phone without handing them your conversations.
          </Text>
        </View>

        {/* Biometric unlock */}
        {biometricSupported && (
          <View style={styles.field}>
            <View style={styles.valueRow}>
              <Text style={styles.label}>Face ID / Fingerprint Unlock</Text>
              <Switch value={biometricEnabled} onValueChange={handleToggleBiometric} />
            </View>
            {biometricPromptPass !== null && (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  placeholder="Confirm passphrase"
                  placeholderTextColor={colors.textTertiary}
                  secureTextEntry
                  value={biometricPromptPass}
                  onChangeText={setBiometricPromptPass}
                  autoFocus
                  onSubmitEditing={handleConfirmEnableBiometric}
                />
                <Pressable onPress={handleConfirmEnableBiometric} style={styles.saveBtn}>
                  <Text style={styles.saveBtnText}>Enable</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Theme */}
        <View style={styles.field}>
          <Text style={styles.label}>Theme</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => (
              <Pressable
                key={opt.mode}
                onPress={() => setMode(opt.mode)}
                style={[styles.themeOption, mode === opt.mode && styles.themeOptionActive]}
              >
                <Text style={[styles.themeOptionText, mode === opt.mode && styles.themeOptionTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Connection info */}
        <View style={styles.field}>
          <Text style={styles.label}>Connected peers</Text>
          <Text style={styles.value}>{onlineUsers.size}</Text>
        </View>

        {/* Chat wallpaper */}
        <View style={styles.field}>
          <Text style={styles.label}>Chat Wallpaper</Text>
          <View style={styles.wallpaperRow}>
            {WALLPAPERS.map((w) => {
              // Deliberately stronger ink than the chat itself: at a thumbnail's size the real
              // value is too sparse to tell the patterns apart.
              const preview = wallpaperPatternSvg(w.id, 'rgba(128,128,128,0.7)')
              const active = (wallpaper || DEFAULT_WALLPAPER) === w.id
              return (
                <Pressable
                  key={w.id}
                  onPress={() => handleSelectWallpaper(w.id)}
                  style={[styles.wallpaperCard, active && styles.wallpaperCardActive]}
                >
                  <View style={styles.wallpaperPreview}>
                    {preview ? <SvgXml xml={preview} width="100%" height="100%" /> : null}
                  </View>
                  <Text style={styles.wallpaperName}>{w.name}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* Contact link — desktop offers this from the profile drawer. */}
        <View style={styles.field}>
          <Pressable onPress={() => navigation.navigate('Invite', { contact: true })} style={styles.keyRow}>
            <Ionicons name="person-add-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.value, { flex: 1 }]}>Invite Someone to Chat</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        {/* Orphaned file cleanup */}
        <View style={styles.field}>
          <Pressable onPress={handleSweepOrphans} style={styles.keyRow}>
            <Ionicons name="trash-bin-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.value, { flex: 1 }]}>Clean Up Orphaned Files</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        {/* Network status */}
        <View style={styles.field}>
          <Pressable onPress={() => navigation.navigate('NetworkStatus')} style={styles.keyRow}>
            <Text style={[styles.value, { flex: 1 }]}>Network Status</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        {/* Device pairing — the screen existed and was registered in the navigator, but nothing
            ever navigated to it, so it was unreachable on mobile. Desktop offers it from the
            profile drawer. */}
        <View style={styles.field}>
          <Pressable onPress={() => navigation.navigate('PairDevice')} style={styles.keyRow}>
            <Text style={[styles.value, { flex: 1 }]}>Pair Device</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        {/* About */}
        <View style={styles.field}>
          <Text style={styles.label}>About</Text>
          <View style={styles.keyRow}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.value, { flex: 1 }]}>Linda {APP_VERSION}</Text>
          </View>
          <Pressable onPress={() => Linking.openURL('https://github.com/scobru/linda')} style={styles.keyRow}>
            <Ionicons name="logo-github" size={16} color={colors.textSecondary} />
            <Text style={[styles.value, { flex: 1 }]}>Source code (open source)</Text>
            <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        {/* Danger Zone */}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <Text style={styles.dangerText}>Permanently wipe your local identity and storage on this device.</Text>
          <Pressable onPress={handleResetDevice} style={[styles.dangerBtn, styles.rowCenter]}>
            <Ionicons name="trash-outline" size={16} color={colors.error} />
            <Text style={styles.dangerBtnText}>Reset This Device</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  container: { padding: spacing.xxl },
  avatarSection: { alignItems: 'center', marginBottom: spacing.xxxl, position: 'relative' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  editBadge: {
    position: 'absolute', bottom: -2, right: -2,
    backgroundColor: colors.bgElevated, borderRadius: 12,
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bgPrimary,
  },
  editBadgeText: { fontSize: 12 },
  avatarPicker: {
    backgroundColor: colors.surface, borderRadius: radii.lg,
    padding: spacing.lg, marginBottom: spacing.xxl,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.textSecondary, fontSize: typography.xs,
    fontWeight: typography.semibold, textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: spacing.md,
  },
  avatarGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: spacing.md, justifyContent: 'center',
  },
  presetBtn: { alignItems: 'center', gap: spacing.xs, padding: spacing.xs },
  presetPressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },
  presetName: { color: colors.textTertiary, fontSize: typography.xs },
  field: {
    marginBottom: spacing.xxl,
  },
  wallpaperRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  wallpaperCard: {
    width: 78,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.bgSecondary,
  },
  wallpaperCardActive: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  wallpaperPreview: {
    width: '100%',
    height: 48,
    backgroundColor: colors.bgPrimary,
  },
  wallpaperName: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    textAlign: 'center',
    paddingVertical: 4,
  },
  label: {
    color: colors.textTertiary, fontSize: typography.xs,
    fontWeight: typography.semibold, textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: spacing.sm,
  },
  value: { color: colors.textPrimary, fontSize: typography.md },
  /** The uppercase label sits above its control everywhere else; on a switch row it sits beside it. */
  labelInline: { marginBottom: 0, flex: 1 },
  fieldHint: { color: colors.textTertiary, fontSize: typography.xs, lineHeight: 16, marginTop: spacing.sm },
  themeRow: { flexDirection: 'row', gap: spacing.sm },
  themeOption: {
    flex: 1, paddingVertical: spacing.sm, alignItems: 'center',
    borderRadius: radii.md, backgroundColor: colors.bgTertiary,
    borderWidth: 1, borderColor: colors.border,
  },
  themeOptionActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  themeOptionText: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: typography.medium },
  themeOptionTextActive: { color: '#ffffff' },
  mono: { color: colors.textSecondary, fontSize: typography.sm, fontFamily: 'monospace' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editIcon: { fontSize: 14 },
  editRow: { flexDirection: 'row', gap: spacing.sm },
  editInput: {
    flex: 1, backgroundColor: colors.inputBg, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.textPrimary, fontSize: typography.md,
    borderWidth: 1, borderColor: colors.border,
  },
  saveBtn: {
    backgroundColor: colors.accent, borderRadius: radii.md,
    paddingHorizontal: spacing.lg, justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: typography.semibold },
  uploadBtn: {
    backgroundColor: colors.bgTertiary, borderRadius: radii.md,
    paddingVertical: spacing.sm, alignItems: 'center', marginBottom: spacing.md,
  },
  uploadBtnText: { color: colors.accentLight, fontSize: typography.sm, fontWeight: typography.medium },
  keyRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.inputBg, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  copyIcon: { fontSize: 16 },
  mnemonicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mnemonicWord: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.inputBg, borderRadius: radii.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderWidth: 1, borderColor: colors.border, minWidth: '30%',
  },
  mnemonicIndex: { color: colors.textTertiary, fontSize: typography.xs },
  mnemonicText: { color: colors.textPrimary, fontSize: typography.sm, fontFamily: 'monospace' },
  copySecretBtn: { marginTop: spacing.xs, alignSelf: 'flex-start' },
  copySecretText: { color: colors.accentLight, fontSize: typography.xs },
  dangerZone: {
    borderWidth: 1, borderColor: colors.error, borderRadius: radii.md,
    padding: spacing.md, gap: spacing.sm, marginTop: spacing.md,
  },
  dangerTitle: { color: colors.error, fontSize: typography.sm, fontWeight: typography.semibold },
  dangerText: { color: colors.textTertiary, fontSize: typography.xs },
  dangerBtn: { alignSelf: 'flex-start' },
  dangerBtnText: { color: colors.error, fontSize: typography.sm, fontWeight: typography.semibold },
})
