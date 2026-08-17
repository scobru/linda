import fs from 'node:fs'
import path from 'node:path'

export interface Profile {
  nickname: string
  avatar?: string
}

const PROFILE_FILE = 'profile.json'

function profilePath(storageDir: string): string {
  return path.join(storageDir, PROFILE_FILE)
}

export function loadProfile(storageDir: string): Profile {
  const file = profilePath(storageDir)
  if (!fs.existsSync(file)) return { nickname: '', avatar: '' }
  try {
    const profile: Profile = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { nickname: profile.nickname ?? '', avatar: profile.avatar ?? '' }
  } catch {
    return { nickname: '', avatar: '' }
  }
}

export function saveProfile(profile: Profile, storageDir: string): void {
  fs.mkdirSync(storageDir, { recursive: true })
  fs.writeFileSync(profilePath(storageDir), JSON.stringify(profile))
}

export function loadNickname(storageDir: string): string {
  return loadProfile(storageDir).nickname
}

export function saveNickname(nickname: string, storageDir: string): void {
  const existing = loadProfile(storageDir)
  saveProfile({ ...existing, nickname }, storageDir)
}

