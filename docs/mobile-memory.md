# Mobile memory diagnosis and mitigation

Date: 2026-11-10. Baseline source: `676b1eb` on `codex/mobile-memory`. No deployment, upload, model conversion, or asset manifest change.

## Finding

The evidence supports memory pressure as the likely phone crash cause; no physical-phone crash log was available. Draco and WebP reduce transfer sizes, not decoded vertex buffers or ordinary RGBA GPU textures. The 52-model library is 166.27 MiB compressed, but the original scene actually requests 46 distinct GLBs (5 buildings, hero, 40 props): 154.65 MiB, plus 5.33 MiB of paintings. The archive building and repeated street placements share geometry and textures; they increase draw work rather than multiplying these unique-resource totals. There are 96 prop placements + 6 buildings + hero = 103 asset instances, matching the README.

All 52 downloaded GLBs were SHA-256 checked against the current manifest. Their JSON accessors and embedded WebP headers were inspected directly by `scripts/audit-mobile-assets.mjs`. Browser-decoded geometry byte counts match the accessor audit.

| Unique model payload | Original/high | Low |
| --- | ---: | ---: |
| Loaded GLBs | 46 | 22 |
| Compressed GLBs (MiB) | 154.65 | 78.31 |
| Decoded model textures, RGBA8 + mipmaps (MiB) | 1,130.67 | 106.67 |
| Geometry attributes + indices, one copy (MiB) | 533.74 | 269.34 |
| Painted landscape textures (MiB) | 21.50 | 11.90 |

Texture estimate: `width × height × 4 × 4/3` (the requested ~1.33 mip factor). A pair of 4096² hero maps consumes 170.67 MiB; a pair of 2048² building maps consumes 42.67 MiB. WebP is decoded before upload; it is not a GPU block-compressed format. CPU image surfaces can add roughly 3/4 of the mipmapped texture estimate. ImageBitmap/native image storage is not completely represented by JS heap statistics.

Geometry estimate: sum each unique primitive attribute/morph/index accessor’s `count × components × componentByteSize`. Draco indices are counted as Uint32 because the vendored decoder emits Uint32 even for glTF accessors declaring smaller indices. This includes skin weights/joints and indices, excludes small animation/skeleton/JS-object overhead and driver alignment. The GPU may need a second copy of every uploaded buffer. Cloned placements are deduplicated. Not all off-screen resources have necessarily been uploaded at the measured camera angle.

## Phone render targets

At a 390×844 CSS viewport and device DPR 3, the old code caps rendering at DPR 1.5, giving 585×1266 = 740,610 pixels. Low mode uses 390×844 = 329,160 pixels.

| Allocation estimate | Original/high | Low |
| --- | ---: | ---: |
| Static cache resolved RGBA16F color + 32-bit depth | 8.48 MiB | 0 |
| Static cache four-sample color + depth attachments | 33.90 MiB | 0 |
| Static cache total | 42.38 MiB | 0 |
| 4096² shadow RGBA8 packed depth color | 64.00 MiB | 0 |
| Shadow depth renderbuffer, 24-bit with typical 32-bit allocation | 48–64 MiB | 0 |
| Main drawing buffer, four-sample color/depth + resolved color assumption | ~25.43 MiB | ~2.51 MiB, single sample |

The shadow implementation was checked in the vendored `WebGLShadowMap`: it allocates a color render target and a depth renderbuffer, not just one 64 MiB texture. MSAA sample counts, depth padding, tile storage, compositor buffers, and retained swap surfaces vary by device. The HDR cache exists only when `EXT_color_buffer_float` is supported. Small shared PMREM environment and skeleton textures are additional. These are budget estimates, not a driver VRAM query.

If all assets are resident, original model/painting textures + GPU geometry + the above targets reach roughly 1.8 GiB on the GPU side; CPU geometry and decoded images can add roughly another 1.4 GiB. Low mode’s corresponding GPU-side estimate is about 390 MiB, plus retained CPU geometry/images and temporary decoding. This is a large reduction, not a guarantee for every phone memory limit.

## Implemented behavior

- Low selection: iPhone/iPad/iPod, touch-capable MacIntel iPadOS, coarse pointer with short viewport/screen side ≤600 px (including landscape phones), or `0 < navigator.deviceMemory ≤ 4`. A narrow mouse-driven desktop window alone stays high. `?quality=low` / `?quality=high` override detection. Selection is fixed for a scene lifetime.
- Low renderer: DPR cap 1, antialias off, shadow maps off, static-frame render target skipped. Existing contact shadows remain. Original geometry is retained for every loaded asset.
- Low loading: one GLB at a time, one Draco worker, then paintings loaded serially, then one street asset at a time. Buildings/hero resize to ≤1024, props to ≤512, paintings to ≤1024 on the longest side. Texture filtering/color-space/wrap/flip settings are preserved; anisotropy is capped at 2.
- Resize happens before insertion/rendering. Shared images/sources are resized once; original ImageBitmaps are closed. Canvas replacements remain available until disposal. Low mode keeps scene/animation results without retaining the full GLTF parser and compressed-buffer caches. No texture variants are fetched.
- Low mode retains 16 prop types, including the bridge, river railing, boat, discovery landmarks, and three residents (courier, maker, reader). Omitted assets are never requested and their colliders are never activated. Bridge traversal stays gated on successful bridge loading. The neighbor progress denominator is 3 in low mode. Saved progress for all 9 is preserved.
- All desktop quality settings remain original: antialias on, DPR cap 2 (1.5 below 600 px), 4096 shadows, HDR/depth static cache with up to four samples, full textures, all 40 props/9 residents, three street workers/two Draco workers. Lighting, models, material settings, placement and animations are unchanged in high mode.
- Loss of WebGL context prevents default destruction, stops frames/input/loading, and shows a Chinese message with a low-mode retry. Restoration keeps the retry UI instead of restarting a full upload. Essential loader failures release the partial city and show retry; optional prop failures retain the existing Chinese partial-detail retry. Late results after disposal are released, and decoder workers are kept until their outstanding jobs settle. Disposal covers shared geometry/material/texture/skeleton resources, image surfaces, cache, environment, shadow target, controls/listeners and renderer.

No mobile GLB variants were prepared. No binaries or credentials are committed. Production URLs and deployment/resource settings are untouched.

## Browser measurements

Playwright 1.65.0 with installed Chromium 148.0.7778.96, launched with `--enable-precise-memory-info`. Phone runs use `devices['iPhone 15']` with viewport explicitly set to 390×844 and DPR 3; desktop is 1280×720 at DPR 2. Each run uses a fresh browser context, waits for all selected props and scene readiness, settles for five seconds, records pre-GC heap, collects garbage via CDP, then snapshots `performance.memory`, `renderer.info`, and live resources. Default day/walking view; no user movement.

The initial agent-side launch was blocked by macOS sandbox MachPortRendezvous permission denial, and browser-control hosting was unavailable. The requested local terminal benchmark subsequently produced `output/mobile-memory/{phone-high,phone-auto,desktop,measurements,fault-checks}.json` and screenshots. These outputs were read and screenshots visually inspected. `?quality=high` is the allowed baseline comparison, preserving original rendering/content settings; no stash or worktree mutation was used. This is Chromium emulation on a Mac, not iOS WebKit or physical-phone RAM/GPU testing.

| Measured after all selected assets load | Phone high baseline | Phone automatic low | Desktop automatic high |
| --- | ---: | ---: | ---: |
| JS heap after GC (MiB) | 545.93 | 280.10 | 546.01 |
| JS heap before GC (MiB) | 563.41 | 285.36 | 551.71 |
| Live scene geometry, one copy (MiB) | 533.84 | 269.44 | 533.84 |
| Estimated scene texture bytes incl. paintings/UI (MiB) | 1,155.02 | 121.44 | 1,155.02 |
| Renderer geometries | 108 | 80 | 108 |
| Renderer textures | 77 | 46 | 99 |
| Render calls, sampled frame | 19 | 97 | 21 |
| Render triangles, sampled frame | 2,030,016 | 10,109,626 | 2,210,017 |
| Render points / lines | 0 / 0 | 0 / 0 | 0 / 0 |
| GLB street loaded / failed | 40 / 0 | 16 / 0 | 40 / 0 |
| Drawing buffer | 585×1266 | 390×844 | 2560×1440 |
| All-assets load time (seconds) | 10.44 | 10.43 | 6.53 |

Low reduces measured heap by 48.7%, estimated scene texture bytes by 89.5%, and geometry by 49.5%. The scene texture estimate counts loaded sources, including off-screen textures, and excludes render targets/environment/bone textures; renderer texture counts describe actually allocated GPU objects, so they are not a byte total and vary with the camera. Geometry totals include procedural ground/UI in addition to GLBs.

**Tradeoff:** skipping the static cache makes low mode submit the visible static city every frame: 10.11 million sampled triangles versus the cached high path’s 2.03 million. The task targets memory, and this sacrifices stationary rendering performance. Camera distances differ naturally because skipped props no longer obstruct the following camera. Phone FPS and physical iOS/Android reliability still need device testing; retained geometry is substantial. A small single-sample cache or locally prepared mobile meshes can be evaluated later if physical-device results require it.

All three runs reported `ready`, zero failed props, no page errors and no console warnings. Desktop assertions verified all 40 props, 9 residents, original texture dimensions, AA, DPR 2, 4096 shadow maps and four-sample static caching. Screenshots show the hero, streets, bridge, paintings and mobile controls. Fault checks passed real `WEBGL_lose_context` loss/restoration, low-mode retry, an injected building download failure, renderer cleanup and successful retry.

## Reproduce and verification

```sh
npm run dev  # http://127.0.0.1:4173, separate terminal
node scripts/audit-mobile-assets.mjs
node scripts/measure-mobile.mjs --faults
npm run check
npm test
VERIFY_ORIGIN=https://mycity.up.railway.app npm run assets:verify
```

If Playwright’s expected Chromium revision is absent, select an installed Chromium with `CHROMIUM_EXECUTABLE`. This machine used:

```sh
CHROMIUM_EXECUTABLE="$HOME/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" node scripts/measure-mobile.mjs --faults
```

`PLAYWRIGHT_MODULE` can point at an installed Playwright `index.mjs`; otherwise the script resolves a project installation or existing npm-cache 1.65.0 installation. `--profiles=phone-high,phone-auto,desktop` selects runs; `--headed` is optional. The debug hook is opt-in at `?debug=1`: `window.__mycityDebug.snapshot()` returns settings, counts, per-asset bytes and readiness. No telemetry is sent. Artifacts and audit-download binaries are under gitignored `output/mobile-memory/`.

- `npm run check`: passed syntax, data, manifest/placement checks.
- `npm test`: passed existing world/static-cache/walking/neighbors/Worker tests and new profile, shared resize/release, concurrency and city-lifecycle tests. Lifecycle tests use real Three.js scenes with network/GPU boundaries stubbed; they cover partial failure, late GLTF arrival, idempotent disposal and restoration waiting for retry.
- Full remote `assets:verify`: passed all 56 assets (52 models + 4 paintings), hashes, clips/skeletons, sizes, MIME, caching, CORS, HEAD and Range; read-only.

## Per-asset audit

All numbers below are MiB except triangle counts and dimensions. Geometry is one decoded attribute/index copy. `—` means not requested by low mode. `library only` assets are already withheld in high mode and excluded from both scene totals. Each model has the two embedded textures shown; every GLB was hash-verified.

| Asset | Triangles | Texture images | Geometry | High textures | Low textures |
| --- | ---: | --- | ---: | ---: | ---: |
| chess | 499,991 | 2048×2048 + 2048×2048 | 21.34 | 42.67 | 10.67 |
| workshop | 499,986 | 2048×2048 + 2048×2048 | 20.90 | 42.67 | 10.67 |
| life | 499,972 | 2048×2048 + 2048×2048 | 22.59 | 42.67 | 10.67 |
| library | 499,976 | 2048×2048 + 2048×2048 | 23.25 | 42.67 | 10.67 |
| next | 499,993 | 2048×2048 + 2048×2048 | 20.55 | 42.67 | 10.67 |
| hero | 600,000 | 4096×4096 + 4096×4096 | 22.91 | 170.67 | 10.67 |
| street-lamp | 350,000 | 2048×2048 + 2048×2048 | 10.16 | 42.67 | 2.67 |
| park-bench | 180,000 | 1024×1024 + 1024×1024 | 5.66 | 10.67 | 2.67 |
| litter-bin | 179,999 | 1024×1024 + 1024×1024 | 5.92 | 10.67 | — |
| direction-sign | 180,000 | 1024×1024 + 1024×1024 | 8.16 | 10.67 | 2.67 |
| notice-board | 179,999 | 1024×1024 + 1024×1024 | 6.69 | 10.67 | 2.67 |
| cafe-set | 349,990 | 2048×2048 + 2048×2048 | 16.04 | 42.67 | — |
| coffee-cart | 179,999 | 1024×1024 + 1024×1024 | 6.46 | 10.67 | 2.67 |
| flower-cart | 180,000 | 1024×1024 + 1024×1024 | 10.98 | 10.67 | 2.67 |
| book-cart | 179,999 | 1024×1024 + 1024×1024 | 5.92 | 10.67 | 2.67 |
| market-crates | 179,999 | 1024×1024 + 1024×1024 | 7.21 | 10.67 | — |
| garden-arch | 349,997 | 2048×2048 + 2048×2048 | 14.65 | 42.67 | 2.67 |
| vine-trellis | 349,999 | 2048×2048 + 2048×2048 | 15.80 | 42.67 | — |
| hydrangea-pot | 279,995 | 1024×1024 + 1024×1024 | 8.20 | 10.67 | — |
| olive-tree | 279,721 | 1024×1024 + 1024×1024 | 24.31 | 10.67 | — |
| plane-tree | 279,999 | 1024×1024 + 1024×1024 | 7.98 | 10.67 | 2.67 |
| cypress-planter | 280,000 | 1024×1024 + 1024×1024 | 12.32 | 10.67 | — |
| blossom-tree | 279,833 | 1024×1024 + 1024×1024 | 23.50 | 10.67 | — |
| river-railing | 350,000 | 2048×2048 + 2048×2048 | 11.08 | 42.67 | 2.67 |
| stone-bridge | 315,633 | 2048×2048 + 2048×2048 | 10.06 | 42.67 | 2.67 |
| mooring-bollard | 179,999 | 1024×1024 + 1024×1024 | 6.10 | 10.67 | — |
| rowboat | 179,999 | 1024×1024 + 1024×1024 | 5.87 | 10.67 | 2.67 |
| duck-family (library only) | 180,000 | 1024×1024 + 1024×1024 | 8.35 | 10.67 | — |
| fountain | 179,970 | 1024×1024 + 1024×1024 | 9.69 | 10.67 | 2.67 |
| cobble-tile (library only) | 179,999 | 1024×1024 + 1024×1024 | 5.32 | 10.67 | — |
| stone-steps (library only) | 180,000 | 1024×1024 + 1024×1024 | 6.34 | 10.67 | — |
| cargo-bike | 350,000 | 2048×2048 + 2048×2048 | 12.21 | 42.67 | — |
| city-bike | 349,920 | 2048×2048 + 2048×2048 | 21.66 | 42.67 | — |
| scooter | 179,998 | 1024×1024 + 1024×1024 | 7.17 | 10.67 | — |
| delivery-van | 179,999 | 1024×1024 + 1024×1024 | 7.78 | 10.67 | — |
| safety-barrier | 180,000 | 1024×1024 + 1024×1024 | 5.62 | 10.67 | — |
| building-materials | 180,000 | 1024×1024 + 1024×1024 | 7.45 | 10.67 | — |
| scaffold | 349,999 | 2048×2048 + 2048×2048 | 12.83 | 42.67 | — |
| arcade-machine | 179,993 | 1024×1024 + 1024×1024 | 6.24 | 10.67 | — |
| street-clock | 180,000 | 1024×1024 + 1024×1024 | 5.68 | 10.67 | — |
| maker | 179,999 | 1024×1024 + 1024×1024 | 8.05 | 10.67 | 2.67 |
| reader | 179,999 | 1024×1024 + 1024×1024 | 8.38 | 10.67 | 2.67 |
| barista | 179,999 | 1024×1024 + 1024×1024 | 7.96 | 10.67 | — |
| florist | 179,999 | 1024×1024 + 1024×1024 | 8.19 | 10.67 | — |
| cyclist | 349,999 | 2048×2048 + 2048×2048 | 15.99 | 42.67 | — |
| courier | 180,000 | 1024×1024 + 1024×1024 | 8.01 | 10.67 | 2.67 |
| strolling-couple (library only) | 179,999 | 1024×1024 + 1024×1024 | 6.35 | 10.67 | — |
| kite-child (library only) | 179,999 | 1024×1024 + 1024×1024 | 5.82 | 10.67 | — |
| construction-worker | 180,000 | 1024×1024 + 1024×1024 | 7.85 | 10.67 | — |
| helper-robot | 179,999 | 1024×1024 + 1024×1024 | 10.29 | 10.67 | — |
| ginger-cat (library only) | 180,000 | 1024×1024 + 1024×1024 | 7.86 | 10.67 | — |
| street-musician | 180,000 | 1024×1024 + 1024×1024 | 8.07 | 10.67 | — |
| distant-town painting | — | 1376×768 | shared sky dome | 5.38 | 2.98 |
| orchards painting | — | 1376×768 | shared sky dome | 5.38 | 2.98 |
| valley painting | — | 1376×768 | shared sky dome | 5.38 | 2.98 |
| village painting | — | 1376×768 | shared sky dome | 5.38 | 2.98 |

The four paintings share one 64×32 procedural sphere; it and the procedural surfaces are included in the browser geometry estimate, not repeated per painting. For the exact current source of GLTF loading/disposal behavior, inspect the vendored `dist/vendor/three/addons/loaders/GLTFLoader.js` and `three.module.js`.
