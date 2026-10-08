#!/bin/zsh
set -e
TASK_ROOT=${0:A:h:h}
TASK_SOURCE=$TASK_ROOT/android
TASK_WORK=$TASK_ROOT/work
TASK_OUT=$TASK_ROOT/outputs
TASK_BUILD_TOOLS=${ANDROID_BUILD_TOOLS:-$HOME/Library/Android/sdk/build-tools/36.0.0}
TASK_JAVA=$(/usr/libexec/java_home -v 17)
TASK_TMP=$(mktemp -d)
trap 'rm -rf "$TASK_TMP"' EXIT
mkdir -p "$TASK_TMP/classes" "$TASK_TMP/dex"
python3 - "$TASK_ROOT" "$TASK_TMP" <<'PY'
import json,pathlib,sys,re
root=pathlib.Path(sys.argv[1]);temp=pathlib.Path(sys.argv[2]);version=json.loads((root/'project.json').read_text())
s=(root/'android/app/src/main/AndroidManifest.xml').read_text();s=re.sub(r' android:versionCode="\d+" android:versionName="[^"]+"','',s);s=s.replace('<manifest ',f'<manifest android:versionCode="{version["androidVersionCode"]}" android:versionName="{version["version"]}" ');s=s.replace('<manifest ',f'<manifest package="{version["identifier"]}" ');s=re.sub(r'<!-- Modified by AI on .*? -->','',s);(temp/'AndroidManifest.xml').write_text(s);(temp/'version').write_text(version['version'])
PY
TASK_VERSION=$(cat "$TASK_TMP/version")
"$TASK_BUILD_TOOLS/aapt2" compile --dir "$TASK_SOURCE/app/src/main/res" -o "$TASK_TMP/compiled.zip"
"$TASK_BUILD_TOOLS/aapt2" link -o "$TASK_TMP/unsigned.apk" -I "$TASK_WORK/android-tools/android.jar" --manifest "$TASK_TMP/AndroidManifest.xml" -A "$TASK_ROOT/dist/android/assets" "$TASK_TMP/compiled.zip" --min-sdk-version 26 --target-sdk-version 35
"$TASK_JAVA/bin/javac" --release 8 -nowarn -classpath "$TASK_WORK/android-tools/android.jar" -d "$TASK_TMP/classes" $(find "$TASK_SOURCE/app/src/main/java" -name '*.java')
"$TASK_BUILD_TOOLS/d8" --min-api 26 --release --lib "$TASK_WORK/android-tools/android.jar" --output "$TASK_TMP/dex" $(find "$TASK_TMP/classes" -name '*.class')
(cd "$TASK_TMP/dex" && zip -q -j ../unsigned.apk classes.dex)
"$TASK_BUILD_TOOLS/zipalign" -f -p 4 "$TASK_TMP/unsigned.apk" "$TASK_TMP/aligned.apk"
TASK_CLASSPATH=$TASK_WORK/android-build/classes:$TASK_WORK/android-tools/apksig.jar
"$TASK_JAVA/bin/java" -cp "$TASK_CLASSPATH" SignApk "$TASK_WORK/android-signing/release.p12" "$TASK_WORK/android-signing/password.txt" "$TASK_TMP/aligned.apk" "$TASK_OUT/flute-key-lab-$TASK_VERSION.apk"
"$TASK_JAVA/bin/java" -cp "$TASK_CLASSPATH" VerifyUpdate "$TASK_OUT/flute-key-lab-1.19.0.apk" "$TASK_OUT/flute-key-lab-$TASK_VERSION.apk"
(cd "$TASK_OUT" && shasum -a 256 "flute-key-lab-$TASK_VERSION.apk" > "flute-key-lab-$TASK_VERSION.sha256")
