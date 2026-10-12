"""Generate the Expansion Planner dock icon (a hexagon outline with a map pin) as an RGBA PNG.

Pure standard library (no PIL). Draws at 4x supersampling for anti-aliasing.
Usage: python -I tools/make-icon.py <out.png> [size]
"""
import math
import struct
import sys
import zlib

GOLD = (232, 217, 168)
SS = 4  # supersampling factor


def hexagon(cx, cy, r):
    # pointy-top hexagon, matching Civ VII's map hexes
    return [(cx + r * math.cos(math.radians(60 * i - 90)), cy + r * math.sin(math.radians(60 * i - 90))) for i in range(6)]


def dist_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def point_in_poly(px, py, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def coverage(x, y, size):
    """Return 1.0 if the sample point (in 0..size space) is ink, else 0.0."""
    s = size / 128.0
    c = 64 * s
    # hexagon outline
    hexa = hexagon(c, c, 52 * s)
    for i in range(6):
        ax, ay = hexa[i]
        bx, by = hexa[(i + 1) % 6]
        if dist_to_segment(x, y, ax, ay, bx, by) <= 4.5 * s:
            return 1.0
    # map pin: circular head with a hole, tapering to a point
    hx, hy, hr = c, 54 * s, 17 * s
    d = math.hypot(x - hx, y - hy)
    if d <= hr and d >= 7 * s:
        return 1.0
    tip = (c, 92 * s)
    left = (c - 14.5 * s, 63 * s)
    right = (c + 14.5 * s, 63 * s)
    if point_in_poly(x, y, [left, right, tip]) and d >= 7 * s:
        return 1.0
    # small ground mark under the pin
    if abs(y - 97 * s) <= 2.2 * s and abs(x - c) <= 13 * s:
        return 1.0
    return 0.0


def render(size):
    rows = []
    for py in range(size):
        row = bytearray([0])  # PNG filter type: None
        for px in range(size):
            acc = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    acc += coverage(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS, size)
            a = int(round(255 * acc / (SS * SS)))
            row += bytes((*GOLD, a))
        rows.append(bytes(row))
    return b"".join(rows)


def png(size, raw):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    out = sys.argv[1]
    size = int(sys.argv[2]) if len(sys.argv) > 2 else 128
    with open(out, "wb") as f:
        f.write(png(size, render(size)))
    print(f"wrote {out} ({size}x{size})")
