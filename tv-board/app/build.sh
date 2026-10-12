#!/bin/bash
# يبني نسخة التلفزيون في dist/ (مستثناة من git لأنها تحمل المفتاح والسر).
# الاستعمال: BOARD_SECRET=… CAMERA_URL=http://<iMac>:1984/stream.html?src=cam1\&mode=webrtc,mse ./build.sh
# المفتاح العام (anon) يُقرأ من ‎.env في جذر المشروع. ثم التغليف والتوقيع بـ Tizen CLI: انظر README.
set -euo pipefail
cd "$(dirname "$0")"
ANON=$(grep '^VITE_SUPABASE_ANON_KEY=' ../../.env | cut -d= -f2-)
: "${BOARD_SECRET:?اضبط BOARD_SECRET (القيمة في lookup_values type=tv_board_config)}"
CAMERA_URL="${CAMERA_URL:-}"
rm -rf dist && mkdir -p dist
python3 - "$ANON" "$BOARD_SECRET" "$CAMERA_URL" <<'PY'
import sys
anon, secret, cam = sys.argv[1:4]
s = open('index.template.html', encoding='utf-8').read()
s = s.replace('__ANON_KEY__', anon).replace('__BOARD_SECRET__', secret).replace('__CAMERA_URL__', cam)
open('dist/index.html', 'w', encoding='utf-8').write(s)
PY
cp config.xml icon.png dist/
echo "✓ dist/ جاهز"
