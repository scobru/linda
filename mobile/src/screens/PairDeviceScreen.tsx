import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  View, Text, Pressable, StyleSheet, SafeAreaView, ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation'
import { startHostedPairing } from '../bare/identity-client'
import { spacing, radii, typography, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

// Matches InviteScreen: the QR renderer is optional, so a build without it degrades to the
// copyable code rather than failing to render the screen at all.
let QRCodeSvg: any = null
try { QRCodeSvg = require('react-native-qrcode-svg').default } catch {}

type Props = NativeStackScreenProps<RootStackParamList, 'PairDevice'>

/**
 * The hosting half of device pairing: this device already holds the identity and hands it to a
 * new one. Mobile previously only had the joining half, so an identity could be carried from
 * desktop to phone but never the other way.
 */
export default function PairDeviceScreen({ navigation }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [code, setCode] = useState('')
  const [paired, setPaired] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false

    startHostedPairing(
      (c) => { if (!cancelled) setCode(c) },
      () => { if (!cancelled) setPaired(true) }
    ).then((stopFn) => {
      // Unmounting before the swarm was ready still has to tear it down.
      if (cancelled) stopFn()
      else stop = stopFn
    }).catch((err) => {
      if (!cancelled) setError((err as Error).message)
    })

    return () => { cancelled = true; stop?.() }
  }, [])

  const handleCopy = useCallback(() => {
    if (!code) return
    void Clipboard.setStringAsync(code)
    Alert.alert('Copied', 'Pairing code copied to the clipboard.')
  }, [code])

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Pair a new device</Text>
        <Text style={styles.subtitle}>
          Scan this from the other device, or paste the code into its “Pair Device” screen.
          The code is single-use and only valid while this screen is open.
        </Text>

        {error ? (
          <View style={styles.stateBox}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.error} />
            <Text style={styles.stateText}>{error}</Text>
          </View>
        ) : paired ? (
          <View style={styles.stateBox}>
            <Ionicons name="checkmark-circle" size={40} color={colors.success} />
            <Text style={styles.stateText}>Device paired.</Text>
            <Pressable onPress={() => navigation.goBack()} style={styles.doneBtn}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        ) : code ? (
          <>
            <View style={styles.qrContainer}>
              {QRCodeSvg ? (
                <QRCodeSvg
                  value={code}
                  size={220}
                  backgroundColor={colors.bgPrimary}
                  color={colors.textPrimary}
                />
              ) : (
                <Text style={styles.stateText}>QR rendering unavailable — use the code below.</Text>
              )}
            </View>

            <Pressable style={styles.codeBox} onPress={handleCopy}>
              <Text style={styles.codeText} numberOfLines={4}>{code}</Text>
              <View style={styles.copyRow}>
                <Ionicons name="copy-outline" size={14} color={colors.textTertiary} />
                <Text style={styles.copyHint}>Tap to copy</Text>
              </View>
            </Pressable>

            <View style={styles.waitingRow}>
              <ActivityIndicator size="small" color={colors.textTertiary} />
              <Text style={styles.waitingText}>Waiting for the other device…</Text>
            </View>
          </>
        ) : (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.stateText}>Generating pairing code…</Text>
          </View>
        )}

        <View style={styles.warnBox}>
          <Ionicons name="warning-outline" size={16} color={colors.warning} />
          <Text style={styles.warnText}>
            Anyone who scans this gains full access to your identity. Only pair devices you own.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  container: { padding: spacing.lg, alignItems: 'center', gap: spacing.md },
  title: { color: colors.textPrimary, fontSize: typography.xl, fontWeight: typography.bold },
  subtitle: {
    color: colors.textSecondary, fontSize: typography.sm, textAlign: 'center', lineHeight: 20,
  },
  qrContainer: {
    backgroundColor: colors.bgPrimary,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeBox: {
    width: '100%',
    backgroundColor: colors.inputBg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  codeText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontFamily: 'monospace',
  },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyHint: { color: colors.textTertiary, fontSize: typography.xs },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  waitingText: { color: colors.textTertiary, fontSize: typography.sm },
  stateBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  stateText: { color: colors.textSecondary, fontSize: typography.md, textAlign: 'center' },
  doneBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  doneText: { color: '#fff', fontWeight: typography.semibold, fontSize: typography.md },
  warnBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  warnText: { flex: 1, color: colors.textSecondary, fontSize: typography.xs, lineHeight: 17 },
})
