import React, { useState, useEffect } from 'react'
import { View, Text, Image, StyleSheet } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { radii, typography, avatarColor, avatarInitials } from '../theme'
import { useTheme } from '../theme-context'

const SVG_DATA_URI_PREFIX = 'data:image/svg+xml;utf8,'

/** react-native's Image can't decode `image/svg+xml` data URIs (raster formats only) — the preset avatars (see theme.ts PRESET_AVATARS) need react-native-svg's own renderer instead. */
function svgXmlFromDataUri(dataUri: string): string {
  return decodeURIComponent(dataUri.slice(SVG_DATA_URI_PREFIX.length))
}

interface Props {
  id: string
  label?: string
  imageUrl?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  online?: boolean
}

const SIZES = { sm: 28, md: 36, lg: 44, xl: 64 }
const FONT_SIZES = { sm: 10, md: 12, lg: 14, xl: 20 }
const INDICATOR_SIZES = { sm: 8, md: 10, lg: 12, xl: 14 }

export default function Avatar({ id, label, imageUrl, size = 'md', online }: Props) {
  const { colors } = useTheme()
  const dim = SIZES[size]
  const fontSize = FONT_SIZES[size]
  const bg = avatarColor(id || 'default')
  const initials = avatarInitials(label || id)

  // A large base64 data: URI occasionally fails to decode (memory pressure, especially while
  // scrolling a list that's recycling these) — RN's Image renders nothing rather than falling
  // back on its own, so without this an avatar can go blank instead of showing initials.
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [imageUrl])

  return (
    <View style={[styles.container, { width: dim, height: dim, borderRadius: dim / 2 }]}>
      {imageUrl && !failed ? (
        imageUrl.startsWith(SVG_DATA_URI_PREFIX) ? (
          <SvgXml xml={svgXmlFromDataUri(imageUrl)} width={dim} height={dim} />
        ) : (
          <Image
            source={{ uri: imageUrl }}
            style={[styles.image, { width: dim, height: dim, borderRadius: dim / 2 }]}
            onError={() => setFailed(true)}
          />
        )
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: dim,
              height: dim,
              borderRadius: dim / 2,
              backgroundColor: bg,
            },
          ]}
        >
          <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
        </View>
      )}
      {online !== undefined && (
        <View
          style={[
            styles.indicator,
            {
              width: INDICATOR_SIZES[size],
              height: INDICATOR_SIZES[size],
              borderRadius: INDICATOR_SIZES[size] / 2,
              backgroundColor: online ? colors.success : colors.textTertiary,
              borderWidth: 2,
              borderColor: colors.bgPrimary,
            },
          ]}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#ffffff',
    fontWeight: typography.bold,
    textTransform: 'uppercase',
  },
  indicator: {
    position: 'absolute',
    bottom: -1,
    right: -1,
  },
})
