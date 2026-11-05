# Geometry and placement revision — 2026-11-05

The earlier export reduced buildings to 32,000 triangles and many props to 8,000 triangles, with 512 px prop textures. The retained Hi3D originals contain roughly two million triangles per asset. They also omit normals; importing and exporting them with flat shading splits nearly every triangle into separate render vertices.

This revision starts from the retained originals, uses Blender MCP for every geometry/material operation, and inspects individual close renders before assembling the street. Buildings now contain approximately 500,000 triangles; detailed bicycles, railings, trellises and scaffolds use approximately 350,000. Ordinary props use approximately 180,000, and trees use approximately 280,000. Buildings and detailed props retain 2048 px textures; other props use 1024 px. The export restores smooth shading with 40-degree hard edges, retains UV seams, and uses high-precision Draco geometry with embedded WebP textures. Texture sampling uses anisotropic filtering in the viewer.

The 51-file library is 159.6 MiB. Geometry detail, rather than a file-size ceiling, controls the export. The active scene loads 45 unique assets (five buildings and 40 props); the archived building shares the arcade geometry. Six unsuitable assets remain available in the library without being loaded into the street: the duck/house diorama, stone steps/house, couple/backdrop, kite child/wall, cat/house and raised cobble tile.

## Physical layout

- Separate land surfaces and retaining walls border the canal. No continuous land plane crosses the water, and no building or street prop intersects the water area.
- The bridge spans both banks, with clear approaches. Its generated stone floor was removed through Blender MCP to open the water passage. The exported arch has at least 0.4246 scene units of clearance above the bank datum throughout the tested boat beam.
- The boat remains centered in the channel. Its hull straddles the waterline, with a small buoyancy motion. Its bow is local **-Z**, confirmed from the stern rudder; its rotation points the bow along the **+X** current. It moves at constant forward speed and wraps only beyond the city edges.
- Parked bicycles, cargo tricycle and van follow the street axis. Unrigged people and vehicles no longer slide back and forth. Cafe furniture is on the far-bank terrace; shop walls, bridge access, railing and furniture footprints are checked for overlap.
- Railings, bridges and other public infrastructure exist throughout the timeline instead of appearing in arbitrary asset-index years. Product-specific people and decorations follow their product's opening year.

## Verification and records

`reference/model-quality.json` contains measured GLB bounds, triangles, vertices, normal presence, embedded texture dimensions, bytes and SHA-256. The manifest check binds those measurements to the exact deployed hashes.

`npm test` checks 85 prop placements plus the six buildings, dry building footprints, object overlap, bridge approaches, vehicle axes, boat bow direction, draft and bridge clearance, and samples 20 minutes of river motion. Tree canopies may overhang nearby objects; the layout keeps their trunks away from buildings and street furniture.

`npm run assets:verify` downloads all 51 R2 objects and verifies complete HTTP 200 responses, checksums, byte lengths, MIME, CORS, immutable cache headers, HEAD and byte-range requests. Browser review covers overview, canal, overhead, night, timeline, building selection and a 390 × 844 mobile viewport. Responsive testing is not a claim about performance on every physical phone.

The local `quality-work` directory retains original-to-final processing logs, all individual previews, an assembled overview, and `product-city-quality.blend`. Original source GLBs remain untouched in `product-city/reference/models-original`. No city content is uploaded to ChatGPT Sites. Railway remains a sleeping static Nginx service; models are served directly from R2 through its existing read-only Worker.
