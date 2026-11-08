"""HTTP の範囲指定で、リモートの zip の中身の一覧だけを読む。

使い方: python -I -X utf8 list_remote_zip.py <url>
"""
import io
import sys
import urllib.request
import zipfile


class RangeFile(io.RawIOBase):
    def __init__(self, url):
        self.url = url
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "30daymapchallenge-day08"})
        with urllib.request.urlopen(req) as r:
            self.size = int(r.headers["Content-Length"])
        self.pos = 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def seek(self, off, whence=0):
        self.pos = {0: off, 1: self.pos + off, 2: self.size + off}[whence]
        return self.pos

    def tell(self):
        return self.pos

    def read(self, n=-1):
        if n < 0:
            n = self.size - self.pos
        if n == 0 or self.pos >= self.size:
            return b""
        end = min(self.pos + n, self.size) - 1
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}", "User-Agent": "30daymapchallenge-day08"})
        with urllib.request.urlopen(req) as r:
            b = r.read()
        self.pos += len(b)
        return b

    def readinto(self, b):
        d = self.read(len(b))
        b[:len(d)] = d
        return len(d)


if __name__ == "__main__":
    z = zipfile.ZipFile(io.BufferedReader(RangeFile(sys.argv[1]), buffer_size=1 << 16))
    for i in z.infolist():
        print(i.file_size, i.filename)
