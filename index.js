// Bridge file: Expo CLI's monorepo-root detection resolves relative-entry lookups to this
// outer directory (regardless of the cwd/entry-file the Android Gradle build passes it) when
// bundling the mobile/ app for release. Real entry point lives in mobile/.
import './mobile/index.js'
