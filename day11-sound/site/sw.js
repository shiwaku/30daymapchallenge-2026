// Service Worker: ページと自分のサイトのデータ（../web/）を端末に保存し、電波が弱くても開けるようにする。
// 背景地図（国土地理院の PMTiles、範囲指定の読み込み）と PLATEAU は保存しない（毎回ネットから読む）。
const CACHE = "day11-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["./", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || req.headers.has("range")) return;
  // ページは新しいものを先に取りにいき、だめなら保存したものを出す
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./"))),
    );
    return;
  }
  // それ以外（JS・CSS・データ）は保存したものを先に出し、裏で新しいものに入れ替える
  e.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res.ok) c.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || net;
      }),
    ),
  );
});
