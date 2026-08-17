import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet,
  SafeAreaView, Alert,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation'
import { unlockIdentity, WrongPassphraseError } from '../bare/identity-client'
import { storageDir } from '../bare/storage-dir'
import { isBiometricLockEnabled, unlockWithBiometrics } from '../bare/biometric-lock'
import { useSession } from '../hooks/useSession'
import { spacing, radii, typography, shadows, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

type Props = NativeStackScreenProps<RootStackParamList, 'Unlock'>

export default function UnlockScreen({ navigation }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [passphrase, setPassphrase] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const { initSession } = useSession()

  const unlockWith = useCallback(async (pass: string) => {
    setLoading(true)
    setError('')
    try {
      const identity = await unlockIdentity(pass, storageDir())
      await initSession(identity, storageDir())
      navigation.reset({ index: 0, routes: [{ name: 'Rooms' }] })
    } catch (err) {
      if (err instanceof WrongPassphraseError) {
        setError('Wrong passphrase')
      } else {
        setError((err as Error).message)
      }
      setLoading(false)
    }
  }, [initSession, navigation])

  const handleUnlock = useCallback(() => {
    if (!passphrase) return
    void unlockWith(passphrase)
  }, [passphrase, unlockWith])

  const handleBiometricUnlock = useCallback(async () => {
    const pass = await unlockWithBiometrics()
    if (pass) void unlockWith(pass)
  }, [unlockWith])

  // Auto-prompt biometrics once on mount if the user opted in (Settings > Biometric unlock).
  const autoPrompted = useRef(false)
  useEffect(() => {
    void isBiometricLockEnabled().then((enabled) => {
      setBiometricAvailable(enabled)
      if (enabled && !autoPrompted.current) {
        autoPrompted.current = true
        void handleBiometricUnlock()
      }
    })
  }, [handleBiometricUnlock])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="lock-closed-outline" size={48} color={colors.accentLight} style={styles.emoji} />
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Enter your passphrase to unlock</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="Passphrase"
            placeholderTextColor={colors.textTertiary}
            value={passphrase}
            onChangeText={(t) => { setPassphrase(t); setError('') }}
            secureTextEntry
            autoFocus
            onSubmitEditing={handleUnlock}
            returnKeyType="go"
          />

          {error !== '' && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          <Pressable
            onPress={handleUnlock}
            disabled={loading || !passphrase}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Unlocking...' : 'Unlock'}
            </Text>
          </Pressable>
        </View>

        {biometricAvailable && (
          <Pressable onPress={() => void handleBiometricUnlock()} style={styles.biometricBtn}>
            <Ionicons name="finger-print-outline" size={20} color={colors.accentLight} />
            <Text style={styles.link}>Use Face ID / Fingerprint</Text>
          </Pressable>
        )}

        <View style={styles.links}>
          <Pressable onPress={() => navigation.navigate('Recover')}>
            <Text style={styles.link}>Recover identity</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  emoji: {
    fontSize: 48,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.title,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  form: {
    gap: spacing.md,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    color: colors.textPrimary,
    fontSize: typography.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.sm,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    ...shadows.glow,
  },
  buttonPressed: {
    backgroundColor: colors.accentDark,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: typography.md,
    fontWeight: typography.semibold,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  links: {
    alignItems: 'center',
    marginTop: spacing.xxxl,
  },
  link: {
    color: colors.accentLight,
    fontSize: typography.sm,
  },
})
