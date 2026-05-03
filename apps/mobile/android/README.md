# APK build support

This repository now includes Android Gradle project scaffolding so engineers can build:

- Debug APK: `npm run android:build:debug`
- Release APK: `npm run android:build:release`
- Release AAB: `npm run android:bundle:release`

## Notes
- The included `gradlew` is a placeholder wrapper script.
- For real builds, open `apps/mobile/android` in Android Studio and generate/sync the Gradle wrapper, or run `gradle wrapper`.
- After syncing Capacitor assets, build from Android Studio or CI with Android SDK installed.

## CI requirements
- Java 17
- Android SDK 35
- Android build tools
- Gradle wrapper generated in project
