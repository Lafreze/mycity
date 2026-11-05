# Project hosting and assets

- The user moved this project to `Lafreze/mycity` on GitHub and Railway. Do not publish this city's code or assets to ChatGPT Sites / GPT hosting. The previous GPT site has a separate blank replacement checkout.
- Use the existing Railway `mycity` project and service. Preserve Serverless idle sleep, one replica, and the resource limits unless the user explicitly changes the requirements.
- Store production GLB files and their embedded materials in the existing Cloudflare R2 `mycity-assets` bucket. The browser uses the read-only Cloudflare asset Worker; do not proxy large models through Railway or add R2 credentials to its runtime.
- Use Hi3D MCP for new 3D models and Blender MCP for model/texture edits. Keep original GLBs and editable Blender files local; commit hashed public URLs and metadata, not model binaries or credentials.
- Run `npm run check` and the relevant `npm test` checks before publishing changes. Asset changes require full remote verification with `npm run assets:verify`.
