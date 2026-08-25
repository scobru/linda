import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, SafeAreaView, ScrollView, Alert, RefreshControl } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Ionicons } from '@expo/vector-icons'
import { useSession } from '../hooks/useSession'
import { getDhtPort, setDhtPort } from '../dht-port'
import { spacing, radii, typography, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

interface NetworkStatus {
  connections: number
  host: string | null
  port: number
  firewalled: boolean
  publicKey: string
}

export default function NetworkStatusScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { session } = useSession()
  const [status, setStatus] = useState<NetworkStatus | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [portInput, setPortInput] = useState('')

  useEffect(() => { void getDhtPort().then((p) => setPortInput(p ? String(p) : '')) }, [])

  // Covers both "cleared the field" and "typed something out of range" — either way there is no
  // usable port, so fall back to automatic rather than storing a value that would silently not
  // be applied. Saved on blur; it only takes effect on the next app start regardless.
  const handlePortBlur = useCallback(() => {
    const value = Number(portInput)
    const valid = Number.isInteger(value) && value > 0 && value < 65536
    setPortInput(valid ? String(value) : '')
    void setDhtPort(valid ? value : undefined)
  }, [portInput])

  const load = useCallback(async () => {
    if (!session) return
    setStatus(await session.getNetworkStatus())
  }, [session])

  useEffect(() => { void load() }, [load])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const handleCopy = useCallback(async (text: string, label: string) => {
    await Clipboard.setStringAsync(text)
    Alert.alert('Copied', `${label} copied to clipboard`)
  }, [])

  const handleCopyAll = useCallback(async () => {
    if (!status) return
    await handleCopy(
      `connections: ${status.connections}\naddress: ${status.host ?? 'unknown'}:${status.port}\nfirewalled: ${status.firewalled}\npublicKey: ${status.publicKey}`,
      'Network info'
    )
  }, [status, handleCopy])

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
      >
        {status?.firewalled && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              Heads up! You're behind a restrictive network (firewall/NAT) — this can prevent direct connections to peers on similarly restrictive networks, e.g. some mobile carriers.
            </Text>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Total Connections</Text>
          <Text style={styles.value}>{status?.connections ?? '—'}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>External Address</Text>
          <Text style={styles.mono}>{status ? `${status.host ?? 'unknown'}:${status.port}` : '—'}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>DHT Port</Text>
          <TextInput
            style={styles.input}
            value={portInput}
            onChangeText={setPortInput}
            onBlur={handlePortBlur}
            keyboardType="number-pad"
            placeholder="Automatic"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={styles.hint}>
            If you run a VPN, set this to the port it forwards — otherwise peers cannot reach you while the VPN is on. Leave empty for automatic. Restart Linda to apply.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Public Key</Text>
          <Pressable onPress={() => status && handleCopy(status.publicKey, 'Public key')} style={styles.keyRow}>
            <Text style={styles.mono} numberOfLines={1}>{status?.publicKey ?? '—'}</Text>
            <Ionicons name="copy-outline" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        <Pressable onPress={handleCopyAll} style={styles.copyAllBtn}>
          <Ionicons name="copy-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.copyAllText}>Copy info for troubleshooting</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  container: { padding: spacing.lg, gap: spacing.lg },
  warningBanner: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  warningText: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20 },
  field: { gap: spacing.xs },
  label: { color: colors.textTertiary, fontSize: typography.xs, fontWeight: typography.medium, textTransform: 'uppercase' },
  value: { color: colors.textPrimary, fontSize: typography.md },
  mono: { color: colors.textPrimary, fontSize: typography.sm, fontFamily: 'monospace' },
  input: {
    color: colors.textPrimary,
    fontSize: typography.md,
    backgroundColor: colors.inputBg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  hint: { color: colors.textTertiary, fontSize: typography.xs, lineHeight: 16 },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inputBg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  copyAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.inputBg,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
  },
  copyAllText: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: typography.medium },
})
