"""程序化验图标：尺寸/透明/圆心/环色/中央文字占比，不依赖视觉模型"""
from PIL import Image
import os, sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")

for name in ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]:
    p = os.path.join(OUT, name)
    im = Image.open(p).convert("RGBA")
    w, h = im.size
    px = im.load()
    S = w
    print(f"\n=== {name}  {w}x{h} mode={im.mode} ===")

    # 1) 四角是否不透明（PWA 图标不应留透明边）
    corners = [(0, 0), (S - 1, 0), (0, S - 1), (S - 1, S - 1)]
    print("  四角 alpha:", [px[x, y][3] for x, y in corners])

    # 2) 中心像素颜色（应为浅色文字）
    c = px[S // 2, S // 2]
    print("  中心像素 RGB:", c[:3])

    # 3) 统计浅色（文字）像素占比，判断文字是否被裁
    light = 0
    light_bbox = [S, S, 0, 0]
    for y in range(0, S, 2):
        for x in range(0, S, 2):
            r, g, b, a = px[x, y]
            if r > 180 and g > 185 and b > 190:
                light += 1
                light_bbox[0] = min(light_bbox[0], x); light_bbox[1] = min(light_bbox[1], y)
                light_bbox[2] = max(light_bbox[2], x); light_bbox[3] = max(light_bbox[3], y)
    total = (S // 2) * (S // 2)
    print(f"  浅色(文字)像素占比: {light/total*100:.2f}%  bbox={light_bbox}")

    # 4) 蓝色环是否存在（ACC 78,161,255 附近）
    blue = 0
    for y in range(0, S, 2):
        for x in range(0, S, 2):
            r, g, b, a = px[x, y]
            if 50 <= r <= 110 and 130 <= g <= 185 and 220 <= b <= 255:
                blue += 1
    print(f"  蓝色(进度环)像素占比: {blue/total*100:.2f}%")

    # 5) 绿色点
    green = 0
    for y in range(0, S, 2):
        for x in range(0, S, 2):
            r, g, b, a = px[x, y]
            if 40 <= r <= 90 and 190 <= g <= 240 and 120 <= b <= 175:
                green += 1
    print(f"  绿色(弧头点)像素占比: {green/total*100:.2f}%")

    # 6) 文字 bbox 是否越界（留白检查）
    if light_bbox[0] < S and light_bbox[2] > 0:
        margin_l = light_bbox[0]; margin_r = S - 1 - light_bbox[2]
        margin_t = light_bbox[1]; margin_b = S - 1 - light_bbox[3]
        print(f"  文字边距 左{margin_l} 右{margin_r} 上{margin_t} 下{margin_b} (单位px, S={S})")
        ok = min(margin_l, margin_r, margin_t, margin_b) > S * 0.08
        print("  文字留白:", "OK" if ok else "偏紧/贴边")
