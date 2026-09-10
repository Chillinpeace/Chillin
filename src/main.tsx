
Time (GMT+5:30)
Message
You reached the start of the range
→ 2026-09-11 03:12
2026-09-11 03:17:49
✓ 1
FROM docker.io/library/node: 20-alpine@sha256: fb4cd12c85ee03686f6af5
1s
362a0b0d56d50c58a04632e6c0fb8363f609372293
2026-09-11 03:17:48
unpacking archive 100 KB
3ms
2026-09-11 03:17:48
✓ uploading snapshot 17 KB
23ms
2026-09-11 03:17:49
✓ internal
load build definition from Dockerfile
Oms
2026-09-11 03:17:49
✓ internal
load metadata for docker.io/library/node: 20-alpine
130ms
2026-09-11 03:17:49
✓ internal
load .dockerignore
Oms
2026-09-11 03:17:49
✓ internal
load build context
Oms
2026-09-11 03:17:49
✓ 4
RUN npm install cached
Oms
2026-09-11 03:17:49
✓ 3
COPY package*.json ./ cached
Oms
2026-09-11 03:17:49
✓2
WORKDIR /app cached
Oms
2026-09-11 03:17:49
✓5
COPY . .
1s
2026-09-11 03:17:49
A6
RUN npm run build
1s
2026-09-11 03:17:53
2026-09-11 03:17:59
> peacely@1.0.0 build
> vite build
vite v5.4.21 building for production...
transforming...
✓2 modules transformed.
x Build failed in 77ms
error during build:
[vite:esbuild] Transform failed with 2 errors:
/app/src/main.tsx:355:11: ERROR: The symbol "tenantName" has already been declared /app/src/main.tsx:361:11: ERROR: The symbol "propertyName" has already been declared file: /app/src/main.tsx: 355:11
The symbol "tenant Name" has already been declared
353
354|
355
T
356
357|
tenantRoom?.beds.filter((b) =>!b.occupied) || [];
function tenantName(id: number) {
return (
tenants.find((t) => t.id === id)?.name || "Unknown tenant"
The symbol "propertyName" has already been declared
359| }
360
361| function propertyName(id: number) {
362|
363|
}
Λ
return properties.find((p) => p.id === id)?.name || "-";
at failureErrorWithLog (/app/node_modules/esbuild/lib/main.js:1472:15)
at /app/node_modules/esbuild/lib/main.js:755:50
at responseCallbacks. <computed> (/app/node_modules/esbuild/lib/main.js:622:9) at handleIncomingPacket (/app/node_modules/esbuild/lib/main.js:677:12)
at Socket.readFromStdout (/app/node_modules/esbuild/lib/main.js:600:7) at Socket.emit (node: events:524:28)
at addChunk (node: internal/streams/readable:561:12)
at readableAddChunkPushByteMode (node: internal/streams/readable:512:3)
at Readable.push (node: internal/streams/readable:392:5)
at Pipe.onStreamRead (node: internal/stream_base_commons:191:23)
Build Failed: build daemon returned an error < failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1 >
scheduling build on Metal builder "builder-ccfcan"
You reached the end of the range 2026-09-11 03:23
