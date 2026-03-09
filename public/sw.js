self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title
      : "Magic Mirror";
  const body =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body
      : "Nieuwe melding";
  const tag = typeof payload.tag === "string" ? payload.tag : "magic-mirror";
  const url =
    payload.data && typeof payload.data.url === "string" && payload.data.url.trim()
      ? payload.data.url
      : "/dashboard/mobile";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    event.notification?.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/dashboard/mobile";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => {
        const currentPath = new URL(client.url).pathname;
        const targetPath = new URL(targetUrl, self.location.origin).pathname;
        return currentPath === targetPath;
      });

      if (existingClient) {
        existingClient.focus();
        existingClient.navigate(targetUrl);
        return;
      }

      self.clients.openWindow(targetUrl);
    }),
  );
});
