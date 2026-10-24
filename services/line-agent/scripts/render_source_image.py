import sys
from pathlib import Path
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS = 40_000_000
with Image.open(sys.argv[1]) as im:
    im = ImageOps.exif_transpose(im).convert('RGB')
    for name, size, quality in [('original', 2400, 90), ('preview', 800, 80)]:
        copy = im.copy()
        copy.thumbnail((size, size))
        copy.save(Path(sys.argv[2]) / (name + '.jpg'), quality=quality)
