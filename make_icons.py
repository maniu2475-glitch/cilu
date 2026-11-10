"""生成词炉的三张 PWA 图标：192 / 512 / maskable-512"""
from PIL import Image, ImageDraw, ImageFont
import os, math

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(OUT, exist_ok=True)

BG_TOP = (26, 34, 49)
BG_BOT = (15, 19, 27)
ACC = (78, 161, 255)
ACC2 = (45, 127, 224)
GLOW = (61, 220, 151)


def font(size, bold=True):
    cands = [
        r"C:\Windows\Fonts\seguisb.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\msyhbd.ttc",
    ]
    for p in cands:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def make(size, maskable=False):
    S = size * 4  # 超采样
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 背景竖直渐变
    for y in range(S):
        t = y / (S - 1)
        r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        d.line([(0, y), (S, y)], fill=(r, g, b, 255))

    # 顶部径向光
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy = S * 0.5, S * 0.16
    for i in range(46, 0, -1):
        rad = S * 0.52 * (i / 46)
        a = int(30 * (1 - i / 46) ** 1.6)
        gd.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(78, 161, 255, a))
    img = Image.alpha_composite(img, glow)
    d = ImageDraw.Draw(img)

    if maskable:
        # maskable 安全区：内容缩到 60%
        pad_scale = 0.62
    else:
        pad_scale = 0.82

    # ---- 图形：一个圆形进度环 + 中间 "W" / 汉字"词" ----
    cx, cy = S / 2, S / 2
    R = S * pad_scale * 0.40
    ring_w = int(S * pad_scale * 0.062)

    # 底环
    d.arc([cx - R, cy - R, cx + R, cy + R], 0, 360, fill=(44, 56, 77, 255), width=ring_w)

    # 进度弧（约 78%）
    d.arc([cx - R, cy - R, cx + R, cy + R], -90, -90 + int(360 * 0.78),
          fill=ACC, width=ring_w)

    # 弧头圆点
    ang = math.radians(-90 + 360 * 0.78)
    px, py = cx + R * math.cos(ang), cy + R * math.sin(ang)
    rr = ring_w * 0.62
    d.ellipse([px - rr, py - rr, px + rr, py + rr], fill=GLOW)

    # 中间字符：词
    ch = "词"
    fsize = int(S * pad_scale * 0.52)
    f = font(fsize)
    bbox = d.textbbox((0, 0), ch, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = cx - tw / 2 - bbox[0]
    ty = cy - th / 2 - bbox[1]
    # 文字阴影
    d.text((tx + S * 0.004, ty + S * 0.004), ch, font=f, fill=(0, 0, 0, 90))
    d.text((tx, ty), ch, font=f, fill=(232, 237, 246, 255))

    # 缩小回目标尺寸
    img = img.resize((size, size), Image.LANCZOS)
    return img


for name, size, mask in [
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("icon-maskable-512.png", 512, True),
]:
    im = make(size, maskable=mask)
    path = os.path.join(OUT, name)
    im.save(path, "PNG")
    print("saved", path, im.size)
