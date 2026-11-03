// The tests were written on macOS: present a Mac webview unless a test stubs navigator itself.
if (typeof navigator !== "undefined") {
  Object.defineProperty(navigator, "userAgent", {
    value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
    configurable: true,
  });
}
