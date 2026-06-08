const CACHE = "speakbiz-v3";

// Всё что нужно для работы офлайн
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone/babel.min.js"
];

// Установка — принудительно кешируем всё
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      return Promise.allSettled(
        ASSETS.map(url =>
          cache.add(url).catch(err => console.log("Cache miss:", url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Активация — берём управление немедленно
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Перехват запросов — кеш в приоритете
self.addEventListener("fetch", e => {
  const url = e.request.url;

  // API запросы — только через сеть
  if (url.includes("anthropic.com")) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({error:"offline"}),
          {status:503, headers:{"Content-Type":"application/json"}})
      )
    );
    return;
  }

  // Всё остальное — сначала кеш, потом сеть
  e.respondWith(
    caches.match(e.request, {ignoreSearch: true}).then(cached => {
      if (cached) {
        // Есть в кеше — отдаём сразу, обновляем в фоне
        fetch(e.request).then(fresh => {
          if (fresh && fresh.status === 200) {
            caches.open(CACHE).then(c => c.put(e.request, fresh));
          }
        }).catch(() => {});
        return cached;
      }

      // Нет в кеше — идём в сеть
      return fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Совсем офлайн — возвращаем главную страницу
        if (e.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return new Response("Offline", {status: 503});
      });
    })
  );
});

// Принудительное обновление кеша каждые 24 часа
self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
