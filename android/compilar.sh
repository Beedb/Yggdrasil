#!/usr/bin/env bash
# Compila o app Android do Yggdrasil sem Android Studio.
# Precisa (Ubuntu/Zorin): sudo apt install aapt apksigner android-sdk-platform-23 dalvik-exchange zipalign openjdk-17-jdk
# Uso: bash compilar.sh <chave.p12> <senha>      -> gera Yggdrasil.apk nesta pasta
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
CHAVE="$1"; SENHA="$2"
[ -f "$CHAVE" ] || { echo "Uso: bash compilar.sh <chave.p12> <senha>"; exit 1; }
J=/usr/lib/android-sdk/platforms/android-23/android.jar
B="$(mktemp -d)"
mkdir -p "$B/gen" "$B/obj" "$B/dex"
aapt package -f -m -J "$B/gen" -M "$AQUI/AndroidManifest.xml" -S "$AQUI/res" -I "$J"
javac -source 8 -target 8 -bootclasspath "$J" -encoding UTF-8 -Xlint:-options -d "$B/obj" "$B"/gen/br/ded/yggdrasil/R.java "$AQUI"/src/br/ded/yggdrasil/*.java
dalvik-exchange --dex --min-sdk-version=23 --output="$B/dex/classes.dex" "$B/obj"
aapt package -f -M "$AQUI/AndroidManifest.xml" -S "$AQUI/res" -I "$J" -F "$B/app.apk"
(cd "$B/dex" && aapt add "$B/app.apk" classes.dex >/dev/null)
zipalign -f -p 4 "$B/app.apk" "$B/alinhado.apk"
apksigner sign --ks "$CHAVE" --ks-key-alias ygg --ks-pass "pass:$SENHA" --key-pass "pass:$SENHA" --min-sdk-version 23 --v4-signing-enabled false --out "$AQUI/Yggdrasil.apk" "$B/alinhado.apk"
rm -rf "$B"
echo "Pronto: $AQUI/Yggdrasil.apk"
