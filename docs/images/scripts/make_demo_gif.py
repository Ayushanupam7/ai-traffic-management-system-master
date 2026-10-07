"""Build a README demo GIF from existing screenshots (slideshow)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FRAMES = [
    ROOT / "dashboard.png",
    ROOT / "carla.png",
    ROOT / "lab.png",
    ROOT / "realworld-detections.png",
]
OUT = ROOT / "demo.gif"
TARGET = (1280, 720)
DURATION_MS = 2500


def main() -> None:
    images: list[Image.Image] = []
    for path in FRAMES:
        if not path.exists():
            raise FileNotFoundError(f"Missing frame: {path}")
        img = Image.open(path).convert("RGB")
        img.thumbnail(TARGET, Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", TARGET, (6, 10, 15))
        ox = (TARGET[0] - img.width) // 2
        oy = (TARGET[1] - img.height) // 2
        canvas.paste(img, (ox, oy))
        images.append(canvas)

    images[0].save(
        OUT,
        save_all=True,
        append_images=images[1:],
        duration=DURATION_MS,
        loop=0,
        optimize=True,
    )
    print(f"Wrote {OUT} ({len(images)} frames)")


if __name__ == "__main__":
    main()
