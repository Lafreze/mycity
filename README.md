# Product City · 产品之城

用 AI，把 idea 具现化。一条沿河街道、五栋产品建筑和记录早期尝试的旧城区。51 个 Hi3D 模型（5 栋建筑 + 46 种街道装饰与居民），通过 Blender MCP 优化，布置为 99 个实例。

线上站点：https://mycity-production-8226.up.railway.app

模型入口：https://mycity-assets.lafreze-city.workers.dev/mycity/ （只提供具体模型文件，不列出目录）

## 本地运行

需要 Node.js 20 或更新版本；前端依赖已经随仓库提供，无须安装运行依赖。

```sh
npm run dev
```

打开 http://127.0.0.1:4173 。直接进入三维模式：http://127.0.0.1:4173/?view=3d 。本地页面也使用远程 R2 模型，因此需要联网。

```sh
npm run check
VERIFY_ORIGIN=https://mycity-production-8226.up.railway.app npm run assets:verify
```

## 托管与空闲成本

- GitHub 保存网站源代码、资源清单、来源记录和部署配置。大模型与嵌入贴图位于 Cloudflare R2，不进入 Git 历史或 Railway 镜像。
- Railway 只运行一个 Nginx 静态服务，不运行 Node 服务、数据库、定时任务、WebSocket、保活探针或服务端 R2 代理。
- `railway.json` 启用 `sleepApplication: true`，单副本，CPU 上限 0.5、内存上限 128 MiB。部署后无流量时可自动休眠；下一次访问会唤醒，可能有短暂冷启动。平台套餐基础费用不由休眠设置取消。
- JS/CSS/HTML/JSON 在镜像构建时预压缩；模型按内容哈希命名，缓存一年。浏览器通过 Cloudflare 只读缓存入口请求 R2 模型，不通过 Railway 中转。
- 只有进入 3D 模式才加载模型；建筑优先，街道资产三路并行加载。页面隐藏时暂停渲染与时间轴。
- `/healthz` 仅用于部署就绪检查，不创建外部定时探活。不要添加持续请求站点的 uptime 保活工具。
- Railway 容器无需任何 R2 凭证；上传只在可信本机通过 Cloudflare Wrangler OAuth 进行。

## 模型更新

生产 GLB 包含 Draco 几何与嵌入 WebP 贴图，共约 19.9 MiB。模型几何和贴图需要修改时使用 Blender MCP。Hi3D 原始模型、可编辑 Blender 工程与下载包保留在本机原始 `product-city` 文件夹，未提交到公开仓库。

`reference/source-models.json` 是逻辑清单；`dist/assets/models/manifest.json` 包含本次发布绑定的 URL、SHA-256 和字节数。新增版本使用新的哈希路径，不覆盖旧资源。

```sh
npm run assets:prepare -- --source /path/to/optimized/models --base https://mycity-assets.lafreze-city.workers.dev/mycity
R2_BUCKET_NAME=mycity-assets npm run assets:upload
VERIFY_ORIGIN=https://mycity-production-8226.up.railway.app npm run assets:verify
npm run check
```

上传脚本仅允许 `mycity/models/` 前缀，不会清理现有 R2 对象。完成验证后再提交更新的 manifest 和部署。公开模型由 `cloudflare/assets-worker.mjs` 提供，R2 桶保持私有，`r2.dev` 不启用。Worker 只开放带哈希的模型路径，支持 GET/HEAD、Range、ETag、边缘缓存和指定来源 CORS；没有目录列表或上传接口。`config/r2-cors.json` 保留对应桶端读取策略，实际公开入口的允许来源由 Worker 管理。

发布资源入口：`npx -y wrangler@4.158.0 deploy --config cloudflare/wrangler.jsonc`。Worker 无定时触发器，只有资源请求时执行。

## 编辑作品

编辑 `dist/products.js`：名称、介绍、分类、上线日期、更新记录、状态、真实 `url`、`demo` 和联系邮箱。当前仍是示例产品；URL 为空时进入产品按钮禁用。未接入真实 GitHub 产品活动。

`dist/props.js` 控制街道物件与居民摆放。旧城区复用游戏厅模型；状态按时间轴变化。支持建筑详情、城市成长、日夜切换、旋转缩放、居民动态、手机和减少动态效果偏好。

## 来源

3D 模型：Hi3D MCP；模型优化与完整场景：Blender MCP。来源与生成提示词保存在 `reference/`。入口插画根据用户提供的参考图通过 ImageGen 编辑得到，和真正的 3D 漫游分开显示。

Three.js 及解码器许可证随 `dist/vendor/three/` 提供。
