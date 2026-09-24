// CloudFront Function (viewer-request): map extension-less paths onto the
// static HTML files the web build emits. Mirrors the Vite dev middleware.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith("/")) {
    request.uri = uri + "index.html";
  } else if (!uri.includes(".")) {
    request.uri = uri + ".html";
  }
  return request;
}
