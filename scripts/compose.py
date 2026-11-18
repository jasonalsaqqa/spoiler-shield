"""Puts docs/demo.png and docs/popup.png side by side into docs/screenshot.png (1280x800)."""
from PIL import Image, ImageDraw, ImageFilter
demo = Image.open('docs/demo.png').convert('RGBA')
pop = Image.open('docs/popup.png').convert('RGBA')
W, H = 1280, 800
out = Image.new('RGBA', (W, H), (17, 17, 22, 255))
out.paste(demo, (0, 0))
panel_x = demo.width
x = panel_x + (W - panel_x - pop.width) // 2
y = (H - pop.height) // 2
mask = Image.new('L', pop.size, 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, pop.width - 1, pop.height - 1], 12, fill=255)
shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
shadow.paste(Image.new('RGBA', pop.size, (0, 0, 0, 200)), (x, y + 10), mask)
out = Image.alpha_composite(out, shadow.filter(ImageFilter.GaussianBlur(20)))
ImageDraw.Draw(out).rounded_rectangle([x - 1, y - 1, x + pop.width, y + pop.height], 13, outline=(44, 44, 53, 255))
out.paste(pop, (x, y), mask)
out.convert('RGB').save('docs/screenshot.png', optimize=True)
