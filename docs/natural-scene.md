# Natural scene continuity

The natural-scene work is on `codex/natural-scene` (base `043d341`): figure grounding, signboard removal and ambient life in `1737b67`; the seamless river/ground-to-painting blend, dashed-line fix, canal seam overlap and shader-injection hardening in the follow-up commit. Figure grounding and the river blend were confirmed with external Chromium screenshots (desktop and iPhone emulation, `output/natural-scene/r2c`, 17/17 shots, zero cache rebuilds). No R2 upload, manifest change or model/image edit was performed.

## River and paintings — current follow-up

The `1737b67` screenshots still showed a ruler-straight blue strip, pointed horizon tip and broad flat green band. A camera-distance fade from 32–78 units compressed almost all of the transition into a few screen pixels. Matching a constant green colour and roughly aligning the painting did not connect their perspective or detail.

The new `landscape-projection.js` provides a shared **viewing-ray projection** for the existing radius-240 painted sphere and the ground skirt. Both intersect the same ray with the same sphere, so a fully blended ground pixel samples exactly the same painting pixel as the background behind it, at every camera angle. The sphere is centred on the canal's Z=8.2 axis; both river mouths use the same existing valley texture, horizontal scale/orientation and river U=0.52. Vertical mapping changes from `0.38 + angle × 1.3` to `0.35 + angle × 0.8`, bringing the painted river's foreground into the transition. Other directions retain the four paintings and their overlap. No images are generated, duplicated or replaced.

The ground now blends directly from town paving into the painting's foreground details over an irregular 12-unit boundary band (`edge` −2 to 10), instead of becoming a uniform green plane. Near soil uses a modest footprint in the **existing painting mipmaps**, fading to normal sharp sampling by `edge` 6 (|X|=23 at the mouths). This suppresses low-contrast silhouettes of distant trees in the closest foreground; the sky remains sharp. A light veil uses the painting's sampled haze colour and is applied identically to sky and skirt. The skirt retains Y=−0.08 throughout the walkable town (|X|≤17), slopes to water level from |X|=17–20, and stays on the static layer. At the outer skirt there is no separate fog colour or alpha endpoint to reveal a horizon line.

Animated water covers only the real **40 × 2.6** canal at Y=−0.23 (previously 420 × 2.6), preserving the full boat/hull-mask path and walkable canal. Its banks soften just beyond the retaining walls, reaching a 0.5-unit feather at |X|=20; its colour reaches the sampled water colour there. An **8 cm overlap at |X|=19.92–20** hands off to the cached skirt, beyond the complete ±19.9 boat envelope. The skirt continues from that same height/colour into a gently curving river, mirrored for east/west and fitted to the painted river at four depths. Its half-width narrows from 1.3 to 0.85 without ever tapering to zero. Edges feather inward; colour blends to the actual painting pixels between |X|=22–30, and opacity fades between |X|=24–36. Thus the procedural ribbon disappears while it still has width, well before the horizon, leaving the painted river to continue. The near-water palette is applied **after lighting/tone mapping**, avoiding a new mismatch between lit water and the unlit painting. Day/night uses shared uniforms.

### `r2a` artifact diagnosis and correction

- **Dashed vertical lines:** the painting shader used implicit `texture2D` derivatives inside non-uniform mouth and sampler-selection branches. The `mouth > .999` boundary projects to X≈392/632 on the 1024-wide desktop review and X≈24/450 on the 473-wide phone review at 45% image height, matching the reported lines. The baseline also selected panel samplers inside branches, accounting for earlier lines at other headings. This is a filtering/LOD error, not cylinder edges, birds or added line geometry. All painting lookups now use `textureGrad`, with derivatives evaluated **before** either branch. Azimuth derivatives use the continuous angular derivative, not the discontinuous `fract` UV, including at the wrap. The central valley still takes one sample; no eager four-texture sampling was added. External GPU captures must confirm removal on both profiles.
- **Horizontal crack:** the dynamic plane ended exactly where the cached ground hole ended. At the raster boundary, neither covered the whole pixel. The supplied desktop PNG has a one-row strip of painting colour around review Y=481 between otherwise matching water colours. The overlap now fades dynamic coverage to zero before its geometry edge. The cached coverage compensates for the dynamic bank alpha, so the overlap is one feathered bank rather than two superimposed ones. There is no new mesh or extra water pass.
- **Dark near-left edge / ghost trees:** the ground hole was cut in elevated/sloping ground coordinates and ended at the inner edge of the water feather. That exposed the background through a hard hole alongside translucent water. Hole coordinates now come from the viewing ray's intersection with the real Y=−0.23 water plane. The hole is restricted to the boat's swept corridor (±0.7 in Z), safely inside opaque water; solid foreground backs the soft banks. Modest near-soil mip filtering suppresses remaining painted tree silhouettes without another lookup, texture or blur pass. An initially broader blur was rejected in the local CPU study because it flattened too much of the valley.

The palette comes from actual median samples of the SHA-verified **valley PNG**, not guessed blue/green values:

| Sample | Original pixel rectangle (right/bottom exclusive) | sRGB |
| --- | --- | --- |
| Foreground water | 842,736–860,745 | `#b5bdb0` |
| Middle river | 822,596–839,605 | `#d1ccb4` |
| Distant river | 602,547–623,554 | `#dddcc4` |
| Atmospheric haze | 670,433–710,449 | `#e2dcc4` |

`reference/landscape-colours.json` records coordinates, medians and the source hash. `test-landscape-blend.mjs` always checks these against the manifest/runtime palette and also resamples the actual PNG when the ignored painting cache is present (it was present and passed here). Missing optional PNG caches are reported; the test does not download assets or silently substitute an image.

**Cost:** zero new textures, render targets, animation timers or dynamic draws. The ground changes from two cached draws / four triangles to one cached draw / eighteen triangles; its tiny vertex/index buffers total 348 bytes. Animated water remains two triangles in its existing pass, with much less off-town area and no painting sampler. This artifact correction adds only a scalar end-alpha fade to its bank mask; it adds no CPU animation update, geometry or pass in low mode. Projection, derivative/filtering corrections and cached bank compositing execute on the static layer, on cache rebuilds or camera movement. Existing low-mode memory limits remain unchanged. Continuous camera movement still incurs the static shader work and needs external performance review.

**Verification and limits:** Node tests check identical sky/skirt rays, both mouth alignments, fractional bank feathering, disappearance without a zero-width tip, unchanged boat/canal limits, shared texture/night uniforms and zero cache rebuilds over sixty stationary frames in high and low. They execute the actual scalar GLSL mask functions to check the overlap identity, full swept-hull clearance and opaque coverage of the ground-hole edges. Shader guards reject implicit texture samples in divergent branches and derivatives evaluated after branching; angular-derivative checks cover every sector/wrap. `npm run check` and `npm test` pass. These tests do not compile/render GPU shaders. The screenshot script asserts `cacheRebuilds === 0` for an enabled cache.

All **17 supplied `r2a` shots** passed capture checks and recorded zero stationary cache rebuilds, despite the visible defects. Phone steady frames peaked at **9 calls / 1,140,006 triangles**, with **209.38 MiB geometry / 101.75 MiB estimated scene textures**. These are measurements of `r2a`, **not the latest artifact corrections**. The local CPU projection studies under ignored `output/natural-scene/river-study/` omit Three.js lighting, models and actual GPU filtering and are **not** screenshot acceptance results. Recheck both river headings and normal views on desktop/phone: dashed lines, the narrow handoff strip, near-bank outlines and excessive foreground haze remain explicit visual acceptance checks. This remains a painted backdrop, not navigable distant terrain.

### Shader concatenation regression

The next external run failed every shot because `WATER_JOIN_GLSL` ended with `}` without a newline. Prepending it to Three's standard fragment shader produced `}#define STANDARD`, which is invalid GLSL. JavaScript syntax checks and the earlier scalar-mask tests did not assemble the complete material shader and missed this error. All three shared GLSL chunks now end with a newline. The water and figure-cut replacements and the low-cache tone-mapping replacement also terminate their own lines instead of relying on whitespace in the original source. No render resources, animation work or numerical water behaviour change in this fix.

`scripts/test-shaders.mjs` now runs in `npm test`. It audits every application-owned shader/hook location under `dist/` and assembles **40 variants** using the actual vendored Three `WebGLPrograms` / `WebGLProgram` builders, with only GL calls replaced by source capture. It executes the real water closure, four hash-specific figure hooks, low-cache wrappers, a composed figure/cache hook, and all custom ShaderMaterials in both quality profiles. Tests observe actual replacement strings, require newline-terminated shared chunks/preludes/replacements/appends, reject code before a preprocessor `#`, and expand all Three includes. A deliberately recreated missing-separator regression must fail the audit. Skinned, mapped, shadow-enabled high, low, direct-screen and cached tone-mapping paths are covered; low-only omitted assets are exercised as material tests without loading them into gameplay.

Literal `smoothstep` edges are checked, and the actual scalar river/bank functions are evaluated across ±210 units with finite, strictly ordered Float32 edges. In particular, feather is in [0, 0.5], so `1.3 - feather` lies in [0.8, 1.3], strictly below `1.3001`, including zero feather. No reversed/equal edge fix was needed.

The shader test optionally compiles/links the assembled GLSL ES sources with `glslangValidator` (override via `GLSLANG_VALIDATOR`). It was **not installed** here, so that step was explicitly skipped; source assembly is not a shader compilation or GPU-render result. No Chromium was launched. `npm run check` and `npm test` must pass before the next external screenshot run.

## Figure bases and ground contact

All ten active figures were inspected from the exact manifest GLBs: verified hashes, node names, accessor bounds, Draco-decoded horizontal bands, and textured front/side point projections. Each has **one mesh / one primitive**, not a separately named removable base. Four have fused pedestals. Other figures' shoes, chair legs and bicycle wheels are real supports and remain. Withheld dioramas stay unloaded.

| Figure | Mesh node | Audited support / treatment |
| --- | --- | --- |
| Hero | `TravelerRuntime` | Two boots, no pedestal; preserve locomotion and 0.0015 sole clearance |
| Maker | `NPCMesh_maker` | Fused disc; bind-space cut Y = −0.4500 |
| Florist | `NPCMesh_florist` | Fused thin disc; cut Y = −0.4680 |
| Helper robot | `NPCMesh_helper-robot` | Fused stepped disc; cut Y = −0.4090 |
| Musician | `NPCMesh_street-musician` | Fused plinth; cut Y = −0.4355, retain instrument case |
| Reader | `NPCMesh_reader` | Chair legs and shoes; no cut |
| Barista | `NPCMesh_barista` | Shoes; no cut |
| Cyclist | `NPCMesh_cyclist` | Tires, pedals and shoes; no cut |
| Courier | `NPCMesh_courier` | One raised walking foot; no cut |
| Construction worker | `NPCMesh_construction-worker` | Boots; no cut |

`reference/figure-bases.json` records mesh bounds, hashes and classifications. `figure-grounding.js` installs a material discard **at load time**, only on the four exact hash/node pairs. It interpolates original bind-space Y before skinning, so an idle gesture cannot move the cut up a leg. Ground contact is measured separately from the **surviving skinned vertices**, in model-root space. Model scale, X/Z centering and bone animation stay unchanged. Pedestal-height reductions are about 7.0 cm (maker), 3.9 cm (florist), 8.2 cm (robot), and 9.4 cm (musician).

### Floating-figure regression and correction — verified in `1737b67`

The original implementation incorrectly transformed raw cut Y through `mesh.matrixWorld` as though the model were rigid. The real GLTFLoader binds these skins with an identity `bindMatrix`; their inverse bone binds cancel the `SourcePlacement` transform (approximately Y −0.5). Applying that placement directly to raw geometry counted its offset again. Negating the resulting contact Y raised the maker by **70.01 cm**, florist by **69.47 cm**, helper robot by **45.01 cm**, and musician by **72.54 cm** at runtime scale. This was a coordinate-space error, not an animation or resident-placement offset. The earlier rigid-box unit test missed it. The corrected grounding below was subsequently verified by the user’s external screenshots and committed in `1737b67`.

`groundFigure` now updates the bones and attached bind inverses with `updateMatrixWorld`, evaluates surviving vertices through `SkinnedMesh.getVertexPosition`, and transforms those results into model-root space. `normalizeStreetModel` is shared by the real placement call site and the integration test; it changes only contact Y. The scan runs once while each of the four models loads, allocates no geometry copies, and adds no per-frame work, draw calls, textures or mobile buffers. Existing roots, scale, yaw and neighbor/shadow placement remain intact.

`scripts/test-figure-grounding.mjs` loads all four SHA-verified cached production GLBs through the vendored GLTFLoader and Draco WASM. Only texture-image decoding is omitted. It preserves original nodes, inverse binds, weights, animation clips and source placement, then applies runtime normalization, placement scale/yaw/floor and the actual neighbor initialization. An independent CPU equivalent of the GPU skinning chunks measures every non-discarded vertex using the Float32 bone palette. The lowest vertex must be within **±1 cm of the visible placement ground Y** (`root.position.y + streetSurfaceY(x,z)`, not the hidden physics plane at zero). Tests cover both clips across their cycles, resident timing, the screenshot pose and an elevated/scaled/yawed placement; X/Z and scale must be unchanged. Current maximum error is below **0.001 mm** in these Node measurements. This is geometry verification, not a GPU or visual acceptance claim.

The test is part of `npm test` and requires cached GLBs under `output/mobile-memory/assets/`. It fails explicitly on missing/mismatched assets instead of silently skipping. On a fresh checkout, populate the ignored cache with `node scripts/audit-mobile-assets.mjs` before running the tests; no binaries enter Git.

All figures, including the hero, now use the actual visible pavement height for their soles/contact shadows instead of floating 1–2 cm above it at physics Y=0. `STREET_SURFACES` is shared by drawing and height lookup. Bridge feet still use its measured deck/stair height. Interaction/collision roots retain their original positions; interaction bounds follow the repositioned visible models. `navigation.json` was regenerated because its source hash includes `world.js`; obstacle and bridge data are unchanged.

This hides fused slabs without vertex surgery and **does not reduce original triangle or decoded-buffer budgets**. Old cut planes deliberately do not apply to future hashes. No edited GLB, alternate manifest entry or upload is needed. A later geometry-size optimization would be a separate Blender/R2 task.

Local evidence is under ignored `output/natural-scene/audit/` (decoded band report and textured point contact sheets). Original cached GLBs remain in ignored `output/mobile-memory/assets/`; paintings were cached only in `output/natural-scene/assets/`.

## Exploration and motion

- Removed the floating “NOTES FROM THE CITY” journal sprite and eight glowing discovery sprites. Building names are explicitly overview-only, including after selecting a product and returning to walking. Physical GLB shop signs and street furniture remain.
- The existing small proximity HUD remains the building prompt in exploration. Its proximity, E handler, tap button, detail dialog and discoveries still use the walking world.
- Three distant swallows (six triangles total) and twenty drifting seeds use at most two draw calls, two tiny buffers and no textures. Both are dynamic-layer objects, without lights or shadows. Low quality and reduced-motion preference allocate neither effect. Dense GLB trees and awnings stay static: moving their complete meshes would sacrifice cache savings.
- Residents have stable ID-based idle phase and ±8% tempo variation. Returning from conversation resumes that resident's phase instead of synchronizing everyone at frame zero. Off-screen pause and distant 20 Hz updates remain. Paused life/reduced motion also pauses resident updates.
- Camera gaze eases with the follow position, reducing bridge-step jolts. Collision checks still use the actual player target. Position and gaze settle exactly, so residual interpolation does not continually invalidate the cache.

Static-frame architecture, render targets, quality selection, texture limits, model concurrency and the low asset set are unchanged. High adds only six triangles / twenty points; low adds zero effect geometry or textures. Removing sprites saves texture allocations. Existing low thresholds (<215 MiB geometry, <110 MiB estimated scene textures, steady <1.5M triangles / <40 calls) remain in force. These are structural bounds and existing targets, **not new browser measurements**.

### Historical wind-sway audit (no longer requested)

The user explicitly does not want tree/flag wind sway; it is excluded from this follow-up. The earlier audit below is historical, not pending work. No tree/plant/flag/awning sway is enabled. The actual cached GLBs for all **45 active building/prop types** were rechecked against their manifest SHA-256 hashes and their node/primitive inventories inspected. Only the stone bridge has small separate primitives (its rigid approach steps); every vegetation prop and building is a single fused mesh/primitive. There are no small independently drawable flags, awnings or leaf clusters to promote to the dynamic layer. The detailed inventory is in ignored `output/natural-scene/audit/sway-candidates.json`.

| Candidate | Triangles per instance | Existing instances | Extra cached-frame triangles / calls if all promoted instances are visible |
| --- | ---: | ---: | ---: |
| Plane tree | 279,999 | 4 | 1,119,996 / 4 |
| Olive tree | 279,721 | 3 | 839,163 / 3 |
| Blossom tree | 279,833 | 2 | 559,666 / 2 |
| Hydrangea pot | 279,995 | 7 | 1,959,965 / 7 |
| Cypress planter | 280,000 | 4 | 1,120,000 / 4 |
| Vine trellis | 349,999 | 2 | 699,998 / 2 |
| Flower cart | 180,000 | 1 | 180,000 / 1 |
| Workshop awning (fused building) | 499,986 | 1 | 499,986 / 1 |

Even two of the smallest trees add about **560,000 triangles and two draws** to steady frames: roughly 28% of the historical ~2M-triangle desktop resident view, with the actual ratio dependent on the view. The flower cart is cheaper but still submits 180,000 triangles just to sway its flowers; wheels, cart and plants share its primitive. A height/vertex shader mask can anchor trunks and pots but cannot avoid submitting the rest of these fused meshes. Leaving the mesh on the static layer freezes its sway after the first cache build; invalidating that cache for every wind tick redraws the whole street.

Those costs do not meet the requested small-effect budget. A suitable future option is a few separately exported, low-triangle foliage/cloth meshes, authored with Blender and verified before any R2 release. No model edits or uploads were made here. **This follow-up adds zero sway triangles, calls, buffers or low-mode work**; the existing desktop birds/seeds retain their six triangles, twenty points and at most two draws. The lack of vegetation sway is an explicit limitation, not a claim that particles implement it.

## Before/after screenshots and metrics

Start the desired checkout's dev server yourself, then run this branch's script from this checkout. It can target another checkout's server using `MEASURE_ORIGIN`; no need to copy the script into main or modify main.

```sh
# Baseline server already running (for example on 4174):
MEASURE_ORIGIN=http://127.0.0.1:4174 SHOT_DIR=output/natural-scene/before node scripts/shoot-scene.mjs

# This branch's server already running on 4173:
node scripts/shoot-scene.mjs

# Optional installed paths, as in measure-mobile:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs CHROMIUM_EXECUTABLE=/absolute/path/to/chromium node scripts/shoot-scene.mjs

npm run check
npm test
node scripts/measure-mobile.mjs --faults
```

Default output: `output/natural-scene/after`. Supports `--profiles=desktop,phone` and `--headed`. Desktop: 1280×720 DPR 2, high. Phone: the same iPhone 15 profile as `measure-mobile.mjs`, explicitly 390×844 DPR 3, **automatic** quality selection. Fresh contexts isolate saved progress and UI state.

Shots: normal spawn, both river mouths, hero feet, maker feet, reader feet/chair, and building entrance; desktop also captures florist/robot/musician (not loaded on low). Fixed world coordinates in `scene-shot-views.mjs` and frozen animation time (12 seconds) make views repeatable. **Framing version 2** moves all feet cameras back/up to include head, hands, feet/supports and a strip of ground with HUD margins. The florist is viewed from the left of the cyclist; the musician from the open promenade left of the bench. The hero's screenshot-only time seek stops the pending fade before setting its time/weight, preventing a backward seek from leaving Idle at zero weight and capturing a T-pose. Both main and this branch receive the same controls. Re-run **both** baseline and after captures for matching version-2 comparisons; the current PNGs are not overwritten by Node tests. Font loading and full selected-asset readiness precede capture. The entrance shot additionally verifies desktop E / phone tap opens the building detail dialog.

`test-scene-shot-framing.mjs` projects the actual decoded figures at the screenshot poses through both viewport cameras, asserting whole-figure/HUD margins for baseline and corrected placement. It executes both main/current walker source with the actual hero GLB and verifies the same idle pose before/after a backward seek. Ray tests against actual nearby decoded prop triangles check the florist/musician ground-to-head sightlines, including the previously obstructing cyclist. These checks supplement the external visual review; no Chromium is launched.

Main has metrics but lacks camera/teleport methods. `scene-shot-hooks.mjs` adds these **only to Playwright's in-memory JavaScript responses**, using the same adapter for both revisions. It does not rewrite either checkout, bypass loading, alter geometry, change renderer settings or disable caching. Unknown or ambiguous source anchors fail explicitly instead of silently capturing an unrelated view. Overrides exist only during this diagnostic run, not normal gameplay.

The first external runs captured the default view, then failed at the first explicit camera view with `camera is not defined`. The original syntax-only checks missed a lexical-scope bug: the helper was inside `createCity3D` but outside its `try` block, while `const camera` lives inside that block. The helper and its state are now injected immediately after the camera declaration, in the same block. Shot FOV is applied after the walking-mode callback (which resets it), and `camera:null` explicitly clears a previous camera lock.

The pure-Node lifecycle test now obtains `git show main:dist/city3d.js` and the working copy, transforms and syntax-checks each, then imports both complete transformed module graphs with GPU/network boundaries stubbed. It calls the actual default/east/west camera setters, fixed-time animation hooks, render tick and reset on real Three.js scenes/cameras. This exercises the lexical lookup that failed in the browser, rather than merely checking that the function text appears inside the outer function. The subsequent external run completed all 17 captures; its visual review exposed the grounding regression described above. A capture's `passed` status checks script/browser health and interaction assertions, **not visual correctness**.

Each shot has a JSON with `status`, `framingVersion`, target `figure` and its last `phase`, plus whatever measurements completed: renderer memory/render counters, quality/asset budgets, actual camera/player pose, pre/post-GC `performance.memory`, sixty live-animation frame samples, median/P95 triangles, maximum calls, cache rebuild delta, errors/warnings and interaction result. Sampling runs **before** freezing animation for the PNG. `measurements.json` accumulates successes and failures as shots finish; `summary.json` reports final totals/failures. A failed shot is logged and the script continues with the remaining shots and profiles, exiting nonzero **at the end** if any failed. Failed pages are closed and recreated so an open dialog, context loss, page crash or previous error log cannot poison later shots. Browser evaluations/GC have bounded waits. Partial metrics survive screenshot/interaction failures; `screenshot:null` means no new PNG was saved, even if an older PNG exists in that directory. Existing files are not deleted.

Compare stationary cache rebuild delta (should be zero), calls/triangles and memory with baseline. Moving-camera/real-phone performance still needs the existing mobile script and device testing.

Unit coverage checks hash-gated cuts/transformed contact heights, protected chair/wheel/boot figures, actual hero pavement contact, bridge height, E/tap interaction callbacks, camera settling, shared horizon fade/day-night uniform, removed UI, effect allocation/triangle bounds and cache reuse over sixty animated updates. Screenshot adapters are parsed and executed in Node against main and the working tree. Failure-injection tests cover continued capture, partial reports, cleanup/write failures and evaluation timeouts. Grounding has passed external visual review. GPU shader compilation and visual acceptance of the current river revision remain for the user's next external run.

`npm run check` and `npm test` pass. Read-only `npm run assets:verify` also passed all 56 remote assets (52 GLBs + four paintings), including hashes, clips/skeletons, MIME, cache/CORS, HEAD and Range. It ran from an isolated ignored working directory so the user's previous verification report was preserved; the new report is `output/natural-scene/remote-check/output/r2-verification.json`.

## Files from `1737b67` and current changes

- Runtime: `dist/city3d.js`, `dist/landscape.js`, `dist/world.js`, `dist/walker.js`, `dist/neighbors.js`, new `dist/figure-grounding.js`, new `dist/ambient-life.js`; `dist/navigation.json` source hash only.
- Evidence/tools/tests: new `reference/figure-bases.json`, new `scripts/shoot-scene.mjs`, new `scripts/scene-shot-hooks.mjs`, new `scripts/scene-shot-runner.mjs`, new `scripts/test-natural-scene.mjs`, new `scripts/test-scene-shot-runner.mjs`, new `scripts/scene-shot-views.mjs`, new `scripts/test-figure-grounding.mjs`, new `scripts/test-scene-shot-framing.mjs`, new Node GLB/skin helpers under `scripts/lib/`, `scripts/test-city-lifecycle.mjs`, `scripts/test-neighbors.mjs`, `package.json`.
- Documentation: `README.md`, `docs/mobile-memory.md`, new `docs/natural-scene.md`.

Current river follow-up: `dist/landscape-projection.js` (new), `dist/landscape.js`, `dist/city3d.js`, `dist/world.js` (remove obsolete fade), `dist/navigation.json` (source hash only), `reference/landscape-colours.json` (new), `scripts/test-landscape-blend.mjs` (new), `scripts/test-natural-scene.mjs`, `scripts/shoot-scene.mjs` (cache assertion), `package.json`, and these docs/README. Figure grounding, residents and wind are unchanged in this follow-up.
