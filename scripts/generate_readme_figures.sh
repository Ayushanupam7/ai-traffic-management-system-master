#!/bin/bash
# Regenerate matplotlib README figures (schematics + results charts).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! python3 -c "import matplotlib" 2>/dev/null; then
  echo "Installing matplotlib..."
  pip install matplotlib
fi

for script in docs/images/scripts/make_*.py; do
  [[ "$script" == *make_demo_gif.py ]] && continue
  echo "Running $script"
  python3 "$script"
done

if python3 -c "import PIL" 2>/dev/null; then
  echo "Running docs/images/scripts/make_demo_gif.py"
  python3 docs/images/scripts/make_demo_gif.py
else
  echo "Skip demo GIF (pip install pillow)"
fi

echo ""
echo "Done. Manual screenshots still needed — see docs/SCREENSHOTS.md"
