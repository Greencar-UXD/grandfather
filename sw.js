/* 또박또박 서비스워커 — 오프라인 셸 + 설치 가능(PWA)
   배포 때마다 갱신이 막히지 않도록:
   - HTML(문서) 요청은 '네트워크 우선' → 새 버전이 바로 반영, 오프라인이면 캐시로 폴백
   - 정적 자원(아이콘/이미지/폰트)은 '캐시 우선' + 백그라운드 갱신
   캐시 버전을 올리면 옛 캐시는 자동 정리된다. */
var CACHE = "ttbk-v1";
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./og.png",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // 외부 도메인(폰트 CDN, 광고 등)은 가로채지 않는다 — 항상 네트워크로.
  if (url.origin !== self.location.origin) return;

  var isDoc = req.mode === "navigate" ||
              (req.headers.get("accept") || "").indexOf("text/html") !== -1;

  if (isDoc) {
    // 네트워크 우선 (새 배포 즉시 반영), 실패 시 캐시
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (m) { return m || caches.match("./index.html"); });
      })
    );
    return;
  }

  // 정적 자원: 캐시 우선 + 백그라운드 갱신
  e.respondWith(
    caches.match(req).then(function (cached) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || net;
    })
  );
});
