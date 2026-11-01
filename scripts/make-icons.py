# Writes the PWA icons as plain PNGs using only the Python standard library.
import pathlib
import struct
import zlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "public"
BG, FOAM, WIRE = (31, 41, 51), (246, 239, 223), (232, 116, 59)


def pixel(x, y):
    """Foam block on a dark tile with a wire dropping in, on a 0..1 square."""
    wire = abs(x - 0.5) < 0.035 and 0.1 < y < 0.62
    arm = abs(y - 0.62) < 0.035 and 0.3 < x < 0.535
    if wire or arm:
        return WIRE
    if 0.14 < x < 0.86 and 0.32 < y < 0.86:
        return FOAM
    return BG


def png(size):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(pixel((x + 0.5) / size, (y + 0.5) / size))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


for size in (192, 512):
    (OUT / f"icon-{size}.png").write_bytes(png(size))
