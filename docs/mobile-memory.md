# Mobile memory diagnosis and mitigation

Date: 2026-11-10. Original high baseline: `676b1eb`; first low mode committed as `36df435`; this follow-up is an uncommitted revision on `codex/mobile-memory`. No deployment, upload, model conversion, or asset manifest change.

## Follow-up: cheap cache and CPU geometry release

The `36df435` measurements below remain historical: **280.10 MiB JS heap, 269.44 MiB geometry, 121.44 MiB scene textures, 97 calls and 10.11M triangles/frame**. No new browser measurements were run for this follow-up. The dev server is off; the updated measurement script is ready for the user's external run.

Current code changes only low-mode behavior:

- A **RGBA8 / UnsignedByte color + 32-bit depth cache, zero MSAA**, at DPR 1: **2.51 MiB** at 390×844. It works without `EXT_color_buffer_float` on the WebGL2 renderer. On such low-mode devices the existing HDR environment bake is also skipped; hemisphere/sun/fill lighting remains. High mode keeps its original environment setup. ACES/exposure is applied to lit materials before storing the color; the copy encodes the stored linear LDR color to the screen once, without a second tone map. Unlit paintings/terrain remain unlit. This avoids the highlight clipping of a naive HDR-to-RGBA8 type swap. Linear 8-bit storage can show more banding than HDR; low-mode night/cached/direct screenshots need visual review in the next run.
- The cache retains real depth for bridge/boat/water occlusion, invalidates on camera movement, viewport, loading, year, and day/night changes, and redraws only the dynamic layer once stable. The two residents (2×179,999), hero (600,000), and boat (179,999) have an all-visible dynamic-model ceiling of **1,139,997 triangles**, plus a few procedural/UI triangles. This is an asset-derived upper estimate for cached steady frames, **not a fresh GPU measurement**. The script requires 60-frame P95 below **1.5M**, under 40 calls, and no cache rebuilds while idle.
- Seven omitted low-mode types save **60.06 MiB** of unique geometry and **18.28 MiB** of compressed downloads: garden arch (14.65 MiB), flower cart (10.98), direction sign (8.16), courier (8.01), notice board (6.69), book cart (5.92), park bench (5.66). No replacement assets are invented. The bridge, river railing, boat, lamps, coffee cart, plane trees, fountains, maker and reader remain; the neighbor HUD automatically reflects 2 residents. Skipped colliders never activate.
- Geometry attributes/index arrays on eligible static GLTF meshes are nulled only by `BufferAttribute.onUpload`, after successful `bufferData`. Bounds are computed first; count, itemSize, normalization and GPU cache metadata remain. Later draws use the same unchanged GPU buffer version. Geometry shared with unsafe meshes, skinned meshes, morph targets, dynamic/interleaved buffers, instanced/wireframe meshes and pick proxies are excluded. The boat is rigid: its transform animation does not mutate geometry, so its arrays can be released too.
- The 15 retained GLBs budget **209.28 MiB** of geometry (previously 269.34 MiB). Up to **169.93 MiB** belongs to rigid assets eligible for release after upload; roughly **39.35 MiB** is the hero + two resident model budget deliberately retained. Off-screen/future meshes keep arrays until uploaded; interleaved/shared backing storage and browser GC can reduce/delay actual savings. These are payload estimates, not promises of a 39 MiB JS heap. GPU geometry is still about 209 MiB if all retained models are resident.
- `geometryBytes` still reports full original attribute/index capacity after CPU release. New `geometryCPUBytes` and `releasedGeometryBytes` report retained arrays and released tracked buffers separately. Debug metadata stores only numbers in a WeakMap, never the original TypedArrays. Per-asset entries remain import-time budgets. Context restoration still waits for explicit retry with freshly loaded models; it must never re-upload the released arrays in the old scene.

The code does not shorten the camera far plane: the enclosing painted sky dome would be clipped. It also avoids introducing hidden colliders or distance-pop thresholds. **Continuous camera movement still draws the visible retained static scene.** The dominant repeated railing/lamp meshes remain expensive during movement; the cache solves stationary cost, not all movement cost. The omitted assets reduce that load, and the variant plan below identifies the remaining issue.

High mode still uses original HDR/MSAA cache, textures, geometry, residents, placement, renderer defaults and CPU arrays. The material shader changes and upload callbacks are installed only for low mode. Existing tests continue to exercise the original high cache path and float-extension fallback.

## Finding

The evidence supports memory pressure as the likely phone crash cause; no physical-phone crash log was available. Draco and WebP reduce transfer sizes, not decoded vertex buffers or ordinary RGBA GPU textures. The 52-model library is 166.27 MiB compressed, but the original scene actually requests 46 distinct GLBs (5 buildings, hero, 40 props): 154.65 MiB, plus 5.33 MiB of paintings. The archive building and repeated street placements share geometry and textures; they increase draw work rather than multiplying these unique-resource totals. There are 96 prop placements + 6 buildings + hero = 103 asset instances, matching the README.

All 52 downloaded GLBs were SHA-256 checked against the current manifest. Their JSON accessors and embedded WebP headers were inspected directly by `scripts/audit-mobile-assets.mjs`. Browser-decoded geometry byte counts match the accessor audit.

| Unique model payload | Original/high | Current low |
| --- | ---: | ---: |
| Loaded GLBs | 46 | 15 |
| Compressed GLBs (MiB) | 154.65 | 60.03 |
| Decoded model textures, RGBA8 + mipmaps (MiB) | 1,130.67 | 88.00 |
| Geometry attributes + indices, one copy (MiB) | 533.74 | 209.28 |
| Painted landscape textures (MiB) | 21.50 | 11.90 |

Texture estimate: `width × height × 4 × 4/3` (the requested ~1.33 mip factor). A pair of 4096² hero maps consumes 170.67 MiB; a pair of 2048² building maps consumes 42.67 MiB. WebP is decoded before upload; it is not a GPU block-compressed format. CPU image surfaces can add roughly 3/4 of the mipmapped texture estimate. ImageBitmap/native image storage is not completely represented by JS heap statistics.

Geometry estimate: sum each unique primitive attribute/morph/index accessor’s `count × components × componentByteSize`. Draco indices are counted as Uint32 because the vendored decoder emits Uint32 even for glTF accessors declaring smaller indices. This includes skin weights/joints and indices, excludes small animation/skeleton/JS-object overhead and driver alignment. The GPU may need a second copy of every uploaded buffer. Cloned placements are deduplicated. Not all off-screen resources have necessarily been uploaded at the measured camera angle.

## Phone render targets

At a 390×844 CSS viewport and device DPR 3, the old code caps rendering at DPR 1.5, giving 585×1266 = 740,610 pixels. Low mode uses 390×844 = 329,160 pixels.

| Allocation estimate | Original/high | Current low |
| --- | ---: | ---: |
| Static cache resolved color + 32-bit depth | 8.48 MiB (RGBA16F) | 2.51 MiB (RGBA8) |
| Static cache four-sample color + depth attachments | 33.90 MiB | 0 |
| Static cache total | 42.38 MiB | 2.51 MiB |
| 4096² shadow RGBA8 packed depth color | 64.00 MiB | 0 |
| Shadow depth renderbuffer, 24-bit with typical 32-bit allocation | 48–64 MiB | 0 |
| Main drawing buffer, four-sample color/depth + resolved color assumption | ~25.43 MiB | ~2.51 MiB, single sample |

The shadow implementation was checked in the vendored `WebGLShadowMap`: it allocates a color render target and a depth renderbuffer, not just one 64 MiB texture. MSAA sample counts, depth padding, tile storage, compositor buffers, and retained swap surfaces vary by device. The HDR cache exists only when `EXT_color_buffer_float` is supported. Small shared PMREM environment and skeleton textures are additional. These are budget estimates, not a driver VRAM query.

If all assets are resident, original model/painting textures + GPU geometry + the above targets reach roughly 1.8 GiB on the GPU side; CPU geometry and decoded images can add roughly another 1.4 GiB. Current low mode’s corresponding GPU-side estimate is about 317 MiB, plus retained CPU geometry/images and temporary decoding. This is a large reduction, not a guarantee for every phone memory limit.

## Implemented behavior

- Low selection: iPhone/iPad/iPod, touch-capable MacIntel iPadOS, coarse pointer with short viewport/screen side ≤600 px (including landscape phones), or `0 < navigator.deviceMemory ≤ 4`. A narrow mouse-driven desktop window alone stays high. `?quality=low` / `?quality=high` override detection. Selection is fixed for a scene lifetime.
- Low renderer: DPR cap 1, antialias off, shadow maps off, RGBA8/depth single-sample static cache enabled. Existing contact shadows remain. Original geometry is retained for every loaded asset.
- Low loading: one GLB at a time, one Draco worker, then paintings loaded serially, then one street asset at a time. Buildings/hero resize to ≤1024, props to ≤512, paintings to ≤1024 on the longest side. Texture filtering/color-space/wrap/flip settings are preserved; anisotropy is capped at 2.
- Resize happens before insertion/rendering. Shared images/sources are resized once; original ImageBitmaps are closed. Canvas replacements remain available until disposal. Low mode keeps scene/animation results without retaining the full GLTF parser and compressed-buffer caches. No texture variants are fetched.
- Low mode retains 9 prop types, including the bridge, river railing, boat, discovery landmarks, and two residents (maker, reader). Omitted assets are never requested and their colliders are never activated. Bridge traversal stays gated on successful bridge loading. The neighbor progress denominator is 2 in low mode. Saved progress for all 9 is preserved.
- All desktop quality settings remain original: antialias on, DPR cap 2 (1.5 below 600 px), 4096 shadows, HDR/depth static cache with up to four samples, full textures, all 40 props/9 residents, three street workers/two Draco workers. Lighting, models, material settings, placement and animations are unchanged in high mode.
- Loss of WebGL context prevents default destruction, stops frames/input/loading, and shows a Chinese message with a low-mode retry. Restoration keeps the retry UI instead of restarting a full upload. Essential loader failures release the partial city and show retry; optional prop failures retain the existing Chinese partial-detail retry. Late results after disposal are released, and decoder workers are kept until their outstanding jobs settle. Disposal covers shared geometry/material/texture/skeleton resources, image surfaces, cache, environment, shadow target, controls/listeners and renderer.

No mobile GLB variants were prepared. No binaries or credentials are committed. Production URLs and deployment/resource settings are untouched.

## Browser measurements — first low mode (`36df435`)

Playwright 1.65.0 with installed Chromium 148.0.7778.96, launched with `--enable-precise-memory-info`. Phone runs use `devices['iPhone 15']` with viewport explicitly set to 390×844 and DPR 3; desktop is 1280×720 at DPR 2. Each run uses a fresh browser context, waits for all selected props and scene readiness, settles for five seconds, records pre-GC heap, collects garbage via CDP, then snapshots `performance.memory`, `renderer.info`, and live resources. Default day/walking view; no user movement.

The initial agent-side launch was blocked by macOS sandbox MachPortRendezvous permission denial, and browser-control hosting was unavailable. The requested local terminal benchmark subsequently produced `output/mobile-memory/{phone-high,phone-auto,desktop,measurements,fault-checks}.json` and screenshots. These outputs were read and screenshots visually inspected. `?quality=high` is the allowed baseline comparison, preserving original rendering/content settings; no stash or worktree mutation was used. This is Chromium emulation on a Mac, not iOS WebKit or physical-phone RAM/GPU testing.

| Measured after all selected assets load | Phone high baseline | First phone low (`36df435`) | Desktop automatic high |
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

**Historical tradeoff, addressed by this follow-up:** the first low mode skipped the static cache and submitted 10.11M triangles per frame. The current low mode restores a 2.51 MiB LDR/depth cache and targets <1.5M triangles in steady frames. New browser numbers are pending; the old results above must not be presented as measurements of the revised implementation. Physical iOS/Android reliability and sustained moving-camera performance still need device testing.

Those three first-round runs reported `ready`, zero failed props, no page errors and no console warnings. Desktop assertions verified all 40 props, 9 residents, original texture dimensions, AA, DPR 2, 4096 shadow maps and four-sample static caching. Screenshots show the hero, streets, bridge, paintings and mobile controls. Fault checks passed real `WEBGL_lose_context` loss/restoration, low-mode retry, an injected building download failure, renderer cleanup and successful retry.

## Reproduce and verification

```sh
npm run dev  # http://127.0.0.1:4173, separate terminal
node scripts/audit-mobile-assets.mjs
node scripts/measure-mobile.mjs --faults
npm run check
npm test
VERIFY_ORIGIN=https://mycity.up.railway.app npm run assets:verify
```

The script now falls back to an already installed Chromium in the Playwright cache when the API’s matching revision is absent. It never installs browsers. `CHROMIUM_EXECUTABLE` can still select one explicitly; the first run used:

```sh
CHROMIUM_EXECUTABLE="$HOME/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" node scripts/measure-mobile.mjs --faults
```

`PLAYWRIGHT_MODULE` can point at an installed Playwright `index.mjs`; otherwise the script resolves a project installation or existing npm-cache 1.65.0 installation. `--profiles=phone-high,phone-auto,desktop` selects runs; `--headed` is optional. The debug hook is opt-in at `?debug=1`: `window.__mycityDebug.snapshot()` returns settings, counts, geometry total/CPU/released bytes, per-asset budgets and readiness; `.frame()` returns lightweight renderer/cache statistics. No telemetry is sent. Artifacts and audit-download binaries are under gitignored `output/mobile-memory/`.

- Current `npm run check`: passed syntax, data, manifest/placement checks.
- Current `npm test`: passed existing world/static-cache/walking/neighbors/Worker tests and new profile, shared resize/release, concurrency and city-lifecycle tests. Lifecycle tests use real Three.js scenes with network/GPU boundaries stubbed; they cover partial failure, late GLTF arrival, idempotent disposal and restoration waiting for retry.
- First-round full remote `assets:verify`: passed all 56 assets (52 models + 4 paintings), hashes, clips/skeletons, sizes, MIME, caching, CORS, HEAD and Range; read-only.

The updated script samples 60 steady frames, asserts the RGBA8/no-MSAA cache is 390×844×8 bytes, expects 9 props / 2 residents, and requires <215 MiB geometry budget, <110 MiB scene texture estimate, >32 MiB released CPU buffers and retained CPU arrays below 80% of the total geometry budget. It verifies that high mode releases no CPU geometry. These are regression thresholds for the known startup view, not device-wide RAM guarantees. `*-latest.json` preserves fresh readings even if a budget assertion fails. `--faults` additionally exercises night cache invalidation, landscape orientation resize, dragging after array release, context loss/restoration/reload, and building failure retry. Review `phone-auto-night.png` for LDR banding/tone mapping and bridge/water occlusion. No server or browser was launched in this follow-up.

Additional unit coverage executes the **actual vendored WebGLAttributes implementation** against a GL boundary stub: initial upload releases arrays, subsequent updates reuse GPU buffers without reading null arrays, cached bounds work on clones, shared resources dispose once, and protected geometry/proxy raycasts retain data. Cache tests cover no-float-extension operation, depth, samples, preservation of prior material hooks, ACES-before-storage/copy-without-ACES, night exposure, reuse, resize, disposal and unchanged high behavior. These tests do not compile shaders on a real GPU; the user's browser rerun remains necessary.

## Mobile variants: plan only, none created

A decimated variant is not required to restore cheap steady frames, but variants are the next step if the goal is smooth sustained movement or a much smaller GPU budget on 3–4 GB phones. Approximate savings below assume vertex/attribute counts scale with triangles; seams, UVs, bones and compression make real results differ. Textures would retain the current low caps. Prepare nothing until device measurements justify it.

| Candidate | Current triangles | Proposed triangles | Approximate geometry saving | Why |
| --- | ---: | ---: | ---: | --- |
| Hero | 600,000 | 60,000 | 20.62 MiB | Every frame; also retained CPU skinning buffers |
| Five buildings | ~2,500,000 total | 100,000 each | 86.90 MiB total | Largest unique GPU budget; archive shares arcade |
| River railing | 350,000 per shared model | 20,000 | 10.45 MiB | 21 placements: 7.35M → 0.42M triangles when all drawn |
| Street lamp | 350,000 per shared model | 20,000 | 9.58 MiB | 9 placements: 3.15M → 0.18M triangles when all drawn |
| Maker + reader | ~360,000 total | 30,000 each | 13.70 MiB total | Animated every visible frame; retained CPU arrays |
| Stone bridge | 315,633 | 60,000 | 8.15 MiB | Keep measured deck/steps and navigation shape |
| Plane tree | 279,999 | 30,000 | 7.12 MiB | Four repeated high-density canopies |

No GLB variants were generated, edited, uploaded or wired into the manifest in this follow-up.

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
| park-bench | 180,000 | 1024×1024 + 1024×1024 | 5.66 | 10.67 | — |
| litter-bin | 179,999 | 1024×1024 + 1024×1024 | 5.92 | 10.67 | — |
| direction-sign | 180,000 | 1024×1024 + 1024×1024 | 8.16 | 10.67 | — |
| notice-board | 179,999 | 1024×1024 + 1024×1024 | 6.69 | 10.67 | — |
| cafe-set | 349,990 | 2048×2048 + 2048×2048 | 16.04 | 42.67 | — |
| coffee-cart | 179,999 | 1024×1024 + 1024×1024 | 6.46 | 10.67 | 2.67 |
| flower-cart | 180,000 | 1024×1024 + 1024×1024 | 10.98 | 10.67 | — |
| book-cart | 179,999 | 1024×1024 + 1024×1024 | 5.92 | 10.67 | — |
| market-crates | 179,999 | 1024×1024 + 1024×1024 | 7.21 | 10.67 | — |
| garden-arch | 349,997 | 2048×2048 + 2048×2048 | 14.65 | 42.67 | — |
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
| courier | 180,000 | 1024×1024 + 1024×1024 | 8.01 | 10.67 | — |
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
