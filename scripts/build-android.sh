#!/bin/zsh
set -e
TASK_ROOT=${0:A:h:h}
TASK_WORK=$TASK_ROOT/work
TASK_OUT=$TASK_ROOT/outputs
TASK_BUILD_TOOLS=${ANDROID_BUILD_TOOLS:-${ANDROID_HOME:-$HOME/Library/Android/sdk}/build-tools/36.0.0}
TASK_JAVA=${JAVA_HOME:-$(/usr/libexec/java_home -v 21)}
TASK_TMP=$(mktemp -d)
trap 'rm -rf "$TASK_TMP"' EXIT
mkdir -p "$TASK_OUT"
TASK_VERSION=$(node -p "require('$TASK_ROOT/project.json').version")
JAVA_HOME="$TASK_JAVA" "$TASK_ROOT/android/gradlew" -p "$TASK_ROOT/android" :app:assembleRelease --console=plain
"$TASK_BUILD_TOOLS/zipalign" -f -p 4 "$TASK_ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk" "$TASK_TMP/aligned.apk"
TASK_CLASSPATH=$TASK_WORK/android-build/classes:$TASK_WORK/android-tools/apksig.jar
"$TASK_JAVA/bin/java" -cp "$TASK_CLASSPATH" SignApk "$TASK_WORK/android-signing/release.p12" "$TASK_WORK/android-signing/password.txt" "$TASK_TMP/aligned.apk" "$TASK_OUT/flute-key-lab-$TASK_VERSION.apk"
(cd "$TASK_OUT" && shasum -a 256 "flute-key-lab-$TASK_VERSION.apk" > "flute-key-lab-$TASK_VERSION.sha256")
