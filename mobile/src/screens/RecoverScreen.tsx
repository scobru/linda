import React, { useState, useCallback, useMemo } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet,
  SafeAreaView, Alert, ScrollView,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation'
import { recoverIdentity, validateMnemonic } from '../bare/identity-client'
import { storageDir } from '../bare/storage-dir'
import { useSession } from '../hooks/useSession'
import { spacing, radii, typography, shadows, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

type Props = NativeStackScreenProps<RootStackParamList, 'Recover'>

export default function RecoverScreen({ navigation }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [mnemonic, setMnemonic] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const { initSession } = useSession()

  const handleRecover = useCallback(async () => {
    const trimmed = mnemonic.trim().toLowerCase()
    if (!(await validateMnemonic(trimmed))) {
      Alert.alert('Error', 'Invalid recovery phrase')
      return
    }
    if (passphrase.length < 4) {
      Alert.alert('Error', 'Passphrase must be at least 4 characters')
      return
    }
    if (passphrase !== confirm) {
      Alert.alert('Error', 'Passphrases do not match')
      return
    }

    setLoading(true)
    try {
      const identity = await recoverIdentity(trimmed, passphrase, storageDir())
      await initSession(identity, storageDir())
      navigation.reset({ index: 0, routes: [{ name: 'Rooms' }] })
    } catch (err) {
      Alert.alert('Error', (err as Error).message)
      setLoading(false)
    }
  }, [mnemonic, passphrase, confirm, initSession, navigation])

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Ionicons name="key-outline" size={48} color={colors.accentLight} style={styles.emoji} />
          <Text style={styles.title}>Recover Identity</Text>
          <Text style={styles.subtitle}>
            Enter your 12-word recovery phrase and choose a new passphrase
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={[styles.input, styles.mnemonicInput]}
            placeholder="Enter recovery phrase (12 words)"
            placeholderTextColor={colors.textTertiary}
            value={mnemonic}
            onChangeText={setMnemonic}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="New passphrase"
            placeholderTextColor={colors.textTertiary}
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm passphrase"
            placeholderTextColor={colors.textTertiary}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
          />

          <Pressable
            onPress={handleRecover}
            disabled={loading}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Recovering...' : 'Recover Identity'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xxl },
  header: { alignItems: 'center', marginBottom: spacing.xxxl },
  emoji: { fontSize: 48, marginBottom: spacing.lg },
  title: { fontSize: typography.title, fontWeight: typography.bold, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { fontSize: typography.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  form: { gap: spacing.md },
  input: {
    backgroundColor: colors.inputBg, borderRadius: radii.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2,
    color: colors.textPrimary, fontSize: typography.md,
    borderWidth: 1, borderColor: colors.border,
  },
  mnemonicInput: { height: 80, textAlignVertical: 'top' },
  button: {
    backgroundColor: colors.accent, borderRadius: radii.md,
    paddingVertical: spacing.md + 2, alignItems: 'center',
    marginTop: spacing.sm, ...shadows.glow,
  },
  buttonPressed: { backgroundColor: colors.accentDark, transform: [{ scale: 0.98 }] },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: typography.md, fontWeight: typography.semibold },
})
