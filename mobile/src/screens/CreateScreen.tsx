import React, { useState, useCallback, useMemo } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet,
  SafeAreaView, Alert, ScrollView,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation'
import { createIdentity, identityExists } from '../bare/identity-client'
import { storageDir } from '../bare/storage-dir'
import { useSession } from '../hooks/useSession'
import { spacing, radii, typography, shadows, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

type Props = NativeStackScreenProps<RootStackParamList, 'Create'>

export default function CreateScreen({ navigation }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mnemonic, setMnemonic] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { initSession } = useSession()

  // Check if we should show unlock instead
  React.useEffect(() => {
    void identityExists(storageDir()).then((exists) => {
      if (exists) navigation.replace('Unlock')
    })
  }, [navigation])

  const handleCreate = useCallback(async () => {
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
      const { identity, mnemonic: m } = await createIdentity(passphrase, storageDir())
      setMnemonic(m)
      await initSession(identity, storageDir())
    } catch (err) {
      Alert.alert('Error', (err as Error).message)
      setLoading(false)
    }
  }, [passphrase, confirm, initSession])

  const handleContinue = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Rooms' }] })
  }

  // Mnemonic reveal view
  if (mnemonic) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Ionicons name="key-outline" size={48} color={colors.accentLight} style={styles.emoji} />
            <Text style={styles.title}>Recovery Phrase</Text>
            <Text style={styles.subtitle}>
              Write down these words and keep them safe. They are the only way to recover your identity.
            </Text>
          </View>

          <View style={styles.mnemonicBox}>
            {mnemonic.split(' ').map((word, i) => (
              <View key={i} style={styles.wordChip}>
                <Text style={styles.wordNum}>{i + 1}</Text>
                <Text style={styles.wordText}>{word}</Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={handleContinue}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonText}>I've saved my recovery phrase</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark-outline" size={48} color={colors.accentLight} style={styles.emoji} />
          <Text style={styles.title}>Create Identity</Text>
          <Text style={styles.subtitle}>
            Your identity lives on your device. No servers, no accounts — just a passphrase you choose.
          </Text>
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
          <TextInput
            style={styles.input}
            placeholder="Confirm passphrase"
            placeholderTextColor={colors.textTertiary}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
          />

          <Pressable
            onPress={handleCreate}
            disabled={loading || passphrase.length < 4}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Creating...' : 'Create Identity'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.links}>
          <Pressable onPress={() => navigation.navigate('Recover')}>
            <Text style={styles.link}>Recover from phrase</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Pair')}>
            <Text style={styles.link}>Pair from another device</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  container: {
    flexGrow: 1,
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
    lineHeight: 22,
    maxWidth: 320,
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
  button: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.sm,
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
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xxl,
    marginTop: spacing.xxxl,
  },
  link: {
    color: colors.accentLight,
    fontSize: typography.sm,
  },
  mnemonicBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    marginBottom: spacing.xxxl,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgTertiary,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  wordNum: {
    color: colors.textTertiary,
    fontSize: typography.xs,
    fontFamily: 'monospace',
    minWidth: 16,
  },
  wordText: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: typography.medium,
  },
})
