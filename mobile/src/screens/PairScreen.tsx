import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet,
  SafeAreaView, Alert, ActivityIndicator,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation'
import { pairAndSave } from '../bare/identity-client'
import { storageDir } from '../bare/storage-dir'
import { useSession } from '../hooks/useSession'
import { spacing, radii, typography, shadows, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

type Props = NativeStackScreenProps<RootStackParamList, 'Pair'>

export default function PairScreen({ navigation }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [code, setCode] = useState('')
  const [passphrase, setPassphrase] = useState('')
  // 'connecting' now covers the whole decode+DHT-connect+save round-trip, which happens
  // together in one worklet call (identity.pair) rather than as two separate steps.
  const [step, setStep] = useState<'input' | 'passphrase' | 'connecting'>('input')

  const handleConnect = useCallback(() => {
    if (code.trim().length < 128) {
      Alert.alert('Error', 'Invalid pairing code. Must be 128 hex characters.')
      return
    }
    setStep('passphrase')
  }, [code])

  const { initSession } = useSession()

  const handleSave = useCallback(async () => {
    if (passphrase.length < 4) {
      Alert.alert('Error', 'Passphrase must be at least 4 characters')
      return
    }

    setStep('connecting')
    try {
      const identity = await pairAndSave(code.trim(), passphrase, storageDir())
      await initSession(identity, storageDir())
      navigation.reset({ index: 0, routes: [{ name: 'Rooms' }] })
    } catch (err) {
      Alert.alert('Error', (err as Error).message)
      setStep('passphrase')
    }
  }, [code, passphrase, initSession, navigation])

  if (step === 'connecting') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.connectingText}>Connecting to paired device...</Text>
          <Text style={styles.subtitle}>Make sure the other device is showing its pairing code</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (step === 'passphrase') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Ionicons name="key-outline" size={48} color={colors.accentLight} style={styles.emoji} />
            <Text style={styles.title}>Almost there</Text>
            <Text style={styles.subtitle}>Choose a passphrase for this device</Text>
          </View>
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Choose a passphrase"
              placeholderTextColor={colors.textTertiary}
              value={passphrase}
              onChangeText={setPassphrase}
              secureTextEntry
              autoFocus
            />
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            >
              <Text style={styles.buttonText}>Save & Continue</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="phone-portrait-outline" size={48} color={colors.accentLight} style={styles.emoji} />
          <Text style={styles.title}>Pair Device</Text>
          <Text style={styles.subtitle}>
            Enter the pairing code shown on your other device
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder="Paste pairing code (128 hex chars)"
            placeholderTextColor={colors.textTertiary}
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <Pressable
            onPress={handleConnect}
            disabled={code.trim().length < 128}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              code.trim().length < 128 && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>Connect</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  container: { flex: 1, justifyContent: 'center', padding: spacing.xxl },
  header: { alignItems: 'center', marginBottom: spacing.xxxl },
  emoji: { fontSize: 48, marginBottom: spacing.lg },
  title: { fontSize: typography.title, fontWeight: typography.bold, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { fontSize: typography.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  connectingText: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: typography.semibold, marginTop: spacing.xl, textAlign: 'center' },
  form: { gap: spacing.md },
  input: {
    backgroundColor: colors.inputBg, borderRadius: radii.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2,
    color: colors.textPrimary, fontSize: typography.md,
    borderWidth: 1, borderColor: colors.border,
  },
  codeInput: { height: 80, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: typography.sm },
  button: {
    backgroundColor: colors.accent, borderRadius: radii.md,
    paddingVertical: spacing.md + 2, alignItems: 'center',
    marginTop: spacing.sm, ...shadows.glow,
  },
  buttonPressed: { backgroundColor: colors.accentDark, transform: [{ scale: 0.98 }] },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: typography.md, fontWeight: typography.semibold },
})
