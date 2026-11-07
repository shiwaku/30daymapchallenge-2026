"""PMTiles v3 をリモートから HTTP の範囲指定で読む（外部の CLI を使わない最小限の実装）。

仕様: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
"""
import gzip
import struct
import urllib.request

UA = "30daymapchallenge-2026-day15/0.1"


def fetch_range(url, offset, length):
    req = urllib.request.Request(url, headers={"Range": f"bytes={offset}-{offset + length - 1}", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
    if len(data) != length:
        raise IOError(f"short read {len(data)} != {length}")
    return data


def _rot(n, x, y, rx, ry):
    if ry == 0:
        if rx == 1:
            x = n - 1 - x
            y = n - 1 - y
        x, y = y, x
    return x, y


def zxy_to_tileid(z, x, y):
    acc = ((1 << (2 * z)) - 1) // 3
    n = 1 << z
    d = 0
    s = n >> 1
    while s > 0:
        rx = 1 if (x & s) else 0
        ry = 1 if (y & s) else 0
        d += s * s * ((3 * rx) ^ ry)
        x, y = _rot(n, x, y, rx, ry)
        s >>= 1
    return acc + d


def tileid_to_zxy(t):
    z = 0
    acc = 0
    while True:
        cnt = 1 << (2 * z)
        if t < acc + cnt:
            break
        acc += cnt
        z += 1
    d = t - acc
    n = 1 << z
    x = y = 0
    s = 1
    while s < n:
        rx = 1 & (d // 2)
        ry = 1 & (d ^ rx)
        x, y = _rot(s, x, y, rx, ry)
        x += s * rx
        y += s * ry
        d //= 4
        s <<= 1
    return z, x, y


def _varint(buf, pos):
    v = 0
    shift = 0
    while True:
        b = buf[pos]
        pos += 1
        v |= (b & 0x7F) << shift
        if b < 0x80:
            return v, pos
        shift += 7


def _decompress(data, comp):
    if comp in (0, 1):
        return data
    if comp == 2:
        return gzip.decompress(data)
    raise ValueError(f"unsupported compression {comp}")


def parse_directory(data):
    n, p = _varint(data, 0)
    ids, runs, lens, offs = [], [], [], []
    last = 0
    for _ in range(n):
        v, p = _varint(data, p)
        last += v
        ids.append(last)
    for _ in range(n):
        v, p = _varint(data, p)
        runs.append(v)
    for _ in range(n):
        v, p = _varint(data, p)
        lens.append(v)
    for i in range(n):
        v, p = _varint(data, p)
        offs.append(offs[i - 1] + lens[i - 1] if (v == 0 and i > 0) else v - 1)
    return list(zip(ids, runs, offs, lens))


class RemotePMTiles:
    def __init__(self, url):
        self.url = url
        h = fetch_range(url, 0, 127)
        if h[:7] != b"PMTiles" or h[7] != 3:
            raise ValueError("not PMTiles v3")
        (self.root_off, self.root_len, self.meta_off, self.meta_len, self.leaf_off, self.leaf_len,
         self.data_off, self.data_len) = struct.unpack_from("<8Q", h, 8)
        self.internal_comp = h[97]
        self.tile_comp = h[98]
        self.tile_type = h[99]
        self.min_zoom, self.max_zoom = h[100], h[101]

    def _dir(self, off, length):
        return parse_directory(_decompress(fetch_range(self.url, off, length), self.internal_comp))

    def entries_up_to(self, max_tileid):
        """tile_id <= max_tileid に関わるタイル項目 (tile_id, run_length, offset, length) を返す。"""
        out = []
        stack = [(self.root_off, self.root_len, False)]
        while stack:
            off, length, is_leaf = stack.pop()
            ents = self._dir(off, length)
            for i, (tid, run, o, l) in enumerate(ents):
                if tid > max_tileid:
                    break
                if run == 0:
                    stack.append((self.leaf_off + o, l, True))
                else:
                    out.append((tid, run, o, l))
        out.sort()
        return out
