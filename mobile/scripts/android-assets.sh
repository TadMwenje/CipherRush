#!/bin/bash
# Android launcher icons and splash screens from the CipherMark artwork in
# mobile/assets/ (the same files the iOS icon and splash come from).
# Renders the SVGs with headless Chrome, so nothing extra to install.
#   cd mobile && ./scripts/android-assets.sh
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
RES=android/app/src/main/res
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# The icon artwork without its dark square: the adaptive icon's foreground layer.
sed 's#<rect width="1024" height="1024" fill="\#0A0E1A"/>##' assets/icon-only.svg > "$TMP/foreground.svg"
cp assets/icon-only.svg assets/splash.svg "$TMP/"

# render <out.png> <width> <height> <html body>
render() {
  cat > "$TMP/page.html" <<HTML
<!doctype html><html><head><style>
html,body{margin:0;width:${2}px;height:${3}px;overflow:hidden;background:transparent}
img{display:block;width:100%;height:100%;object-fit:cover}
</style></head><body>$4</body></html>
HTML
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --window-size="$2,$3" \
    --screenshot="$1" "file://$TMP/page.html" >/dev/null 2>&1
}

# density: legacy icon size, adaptive foreground size
for spec in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  IFS=: read -r density icon fg <<<"$spec"
  dir="$RES/mipmap-$density"
  render "$dir/ic_launcher.png" "$icon" "$icon" '<img src="icon-only.svg" style="border-radius:16%">'
  render "$dir/ic_launcher_round.png" "$icon" "$icon" '<img src="icon-only.svg" style="border-radius:50%">'
  render "$dir/ic_launcher_foreground.png" "$fg" "$fg" '<img src="foreground.svg">'
done

# Splash (Android 11 and older; 12+ draws the launcher icon on the theme colour).
for spec in mdpi:320:480 hdpi:480:800 xhdpi:720:1280 xxhdpi:960:1600 xxxhdpi:1280:1920; do
  IFS=: read -r density w h <<<"$spec"
  render "$RES/drawable-port-$density/splash.png" "$w" "$h" '<img src="splash.svg">'
  render "$RES/drawable-land-$density/splash.png" "$h" "$w" '<img src="splash.svg">'
done
render "$RES/drawable/splash.png" 480 320 '<img src="splash.svg">'
echo "Android icons and splash written to $RES"
