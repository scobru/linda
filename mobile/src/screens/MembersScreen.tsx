import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, SafeAreaView, Alert } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation'
import { useSession } from '../hooks/useSession'
import { useContacts } from '../hooks/useContacts'
import Avatar from '../components/Avatar'
import { spacing, radii, typography, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'
import type { MemberInfo } from '@core/rooms/room'

type Props = NativeStackScreenProps<RootStackParamList, 'Members'>

function Badge({ icon, label, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Ionicons name={icon} size={11} color={color} />
      <Text style={{ color, fontSize: typography.xs }}>{label}</Text>
    </View>
  )
}

interface ModerationState {
  members: MemberInfo[]
  ownerId: string | null
  moderators: string[]
  muted: string[]
  banned: string[]
}

export default function MembersScreen({ route, navigation }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { roomId } = route.params
  const { session, identity, nicknames, avatars, onlineUsers, refresh: refreshSession } = useSession()
  const { contacts, sendRequest } = useContacts()
  const [state, setState] = useState<ModerationState | null>(null)

  const room = session?.getRoom(roomId)

  const refresh = useCallback(async () => {
    if (!room) return
    setState(await room.listMembers())
  }, [room])

  useEffect(() => { void refresh() }, [refresh])

  const myId = identity?.id ?? ''
  const iAmOwner = state?.ownerId === myId
  const iAmModerator = state?.moderators.includes(myId) ?? false
  const iCanModerate = iAmOwner || iAmModerator

  const displayName = useCallback((identityId: string) => {
    if (identityId === myId) return 'You'
    return nicknames.get(identityId) || identityId.slice(0, 8)
  }, [myId, nicknames])

  const run = useCallback((action: () => Promise<void>) => {
    void action().then(refresh).catch((err) => Alert.alert('Error', (err as Error).message))
  }, [refresh])

  const confirmKick = useCallback((member: MemberInfo) => {
    Alert.alert('Kick member?', 'They will lose write access to this room.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Kick', style: 'destructive', onPress: () => run(() => session!.kickMember(roomId, member.writerKey)) },
    ])
  }, [session, roomId, run])

  const confirmBan = useCallback((member: MemberInfo) => {
    Alert.alert('Ban member?', 'They will be kicked and blocked from rejoining, even with a valid invite.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Ban', style: 'destructive', onPress: () => run(() => session!.banMember(roomId, member.writerKey, member.identityId)) },
    ])
  }, [session, roomId, run])

  const handleLeaveRoom = useCallback(() => {
    if (!session) return
    Alert.alert('Leave room?', "You'll need a new invite to rejoin.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive', onPress: () => {
          void session.deleteRoom(roomId).then(() => {
            refreshSession()
            navigation.reset({ index: 0, routes: [{ name: 'Rooms' }] })
          })
        },
      },
    ])
  }, [session, roomId, navigation, refreshSession])

  if (!state) return <SafeAreaView style={styles.safe} />

  const bannedList = state.banned

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={state.members}
        keyExtractor={(m) => m.writerKey}
        ListFooterComponent={bannedList.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>Banned</Text>
            {bannedList.map((bannedId) => (
              <View key={bannedId} style={styles.row}>
                <Avatar id={bannedId} label={displayName(bannedId)} />
                <View style={styles.info}>
                  <Text style={styles.name}>{displayName(bannedId)}</Text>
                  <Badge icon="close-circle-outline" label="Banned" color={colors.error} />
                </View>
                {iCanModerate && (
                  <Pressable onPress={() => run(() => session!.unbanMember(roomId, bannedId))} style={styles.actionBtn}>
                    <Text style={styles.actionText}>Unban</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        ) : null}
        renderItem={({ item }) => {
          const isOwner = item.identityId === state.ownerId
          const isMod = state.moderators.includes(item.identityId)
          const isMuted = state.muted.includes(item.identityId)
          const isSelf = item.identityId === myId
          const isPrivileged = isOwner || isMod
          const name = displayName(item.identityId)

          return (
            <View style={styles.row}>
              <Avatar id={item.identityId} label={name} imageUrl={avatars.get(item.identityId)} online={onlineUsers.has(item.identityId)} />
              <View style={styles.info}>
                <Text style={styles.name}>{name}</Text>
                <View style={styles.badgeRow}>
                  {isOwner && <Badge icon="star" label="Owner" color={colors.warning} />}
                  {isMod && !isOwner && <Badge icon="shield-outline" label="Mod" color={colors.info} />}
                  {isMuted && <Badge icon="volume-mute-outline" label="Muted" color={colors.textTertiary} />}
                </View>
              </View>
              <View style={styles.actions}>
                {!isSelf && !contacts.some((c) => c.userId === item.identityId) && (
                  <Pressable
                    onPress={() => sendRequest(item.identityId, name).then((ok) => {
                      if (!ok) Alert.alert('Could not send request', 'This member is not currently connected.')
                    })}
                    style={styles.actionBtn}
                  >
                    <Text style={styles.actionText}>Add contact</Text>
                  </Pressable>
                )}
                {iAmOwner && !isOwner && !isSelf && (
                  <Pressable
                    onPress={() => run(() => isMod ? session!.demoteModerator(roomId, item.identityId) : session!.promoteToModerator(roomId, item.identityId))}
                    style={styles.actionBtn}
                  >
                    <Text style={styles.actionText}>{isMod ? 'Demote' : 'Promote'}</Text>
                  </Pressable>
                )}
                {iCanModerate && !isPrivileged && !isSelf && (
                  <Pressable
                    onPress={() => run(() => isMuted ? session!.unmuteMember(roomId, item.identityId) : session!.muteMember(roomId, item.identityId))}
                    style={styles.actionBtn}
                  >
                    <Text style={styles.actionText}>{isMuted ? 'Unmute' : 'Mute'}</Text>
                  </Pressable>
                )}
                {iCanModerate && !isPrivileged && !isSelf && (
                  <Pressable onPress={() => confirmKick(item)} style={styles.actionBtn}>
                    <Text style={styles.actionText}>Kick</Text>
                  </Pressable>
                )}
                {iCanModerate && !isPrivileged && !isSelf && (
                  <Pressable onPress={() => confirmBan(item)} style={[styles.actionBtn, styles.banBtn]}>
                    <Text style={styles.actionText}>Ban</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )
        }}
      />
      <Pressable onPress={handleLeaveRoom} style={styles.leaveBtn}>
        <Ionicons name="exit-outline" size={16} color={colors.error} />
        <Text style={styles.leaveBtnText}>Leave Room</Text>
      </Pressable>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  info: { flex: 1, gap: 2 },
  name: { color: colors.textPrimary, fontSize: typography.md, fontWeight: typography.medium },
  badgeRow: { flexDirection: 'row', gap: spacing.sm },
  badge: { color: colors.textTertiary, fontSize: typography.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, maxWidth: 180, justifyContent: 'flex-end' },
  actionBtn: {
    backgroundColor: colors.bgTertiary, borderRadius: radii.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  banBtn: { backgroundColor: colors.error },
  actionText: { color: colors.textPrimary, fontSize: typography.xs, fontWeight: typography.semibold },
  sectionTitle: {
    color: colors.textSecondary, fontSize: typography.xs, fontWeight: typography.semibold,
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.bgSecondary,
  },
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, margin: spacing.lg,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.error,
  },
  leaveBtnText: { color: colors.error, fontSize: typography.md, fontWeight: typography.semibold },
})
