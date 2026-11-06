# Product City · 产品之城

用 AI，把 idea 具现化。一条沿河街道、五栋产品建筑和记录早期尝试的旧城区。51 个 Hi3D 模型（5 栋建筑 + 46 种街道装饰与居民），通过 Blender MCP 恢复高精度几何和法线。当前场景使用 40 种道具、5 栋建筑与一栋旧城区复用建筑，共 91 个实例；6 个不适合摆放的模型保留在资源库。

线上站点：https://mycity.up.railway.app

模型入口：https://mycity-assets.lafreze-city.workers.dev/mycity/ （只提供具体模型文件，不列出目录）

## 本地运行

需要 Node.js 20 或更新版本；前端依赖已经随仓库提供，无须安装运行依赖。

```sh
npm run dev
```

打开 http://127.0.0.1:4173 即进入三维街区。本地页面也使用远程 R2 模型，因此需要联网。

```sh
npm run check
VERIFY_ORIGIN=https://mycity.up.railway.app npm run assets:verify
```

## 托管与空闲成本

- GitHub 保存网站源代码、资源清单、来源记录和部署配置。大模型与嵌入贴图位于 Cloudflare R2，不进入 Git 历史或 Railway 镜像。
- Railway 只运行一个 Nginx 静态服务，不运行 Node 服务、数据库、定时任务、WebSocket、保活探针或服务端 R2 代理。
- `railway.json` 启用 `sleepApplication: true`，单副本，CPU 上限 0.5、内存上限 128 MiB。部署后无流量时可自动休眠；下一次访问会唤醒，可能有短暂冷启动。平台套餐基础费用不由休眠设置取消。
- JS/CSS/HTML/JSON 在镜像构建时预压缩；模型按内容哈希命名，缓存一年。浏览器通过 Cloudflare 只读缓存入口请求 R2 模型，不通过 Railway 中转。
- 首页直接启动全屏 3D；建筑优先，街道资产三路并行加载并显示简短进度。加载失败可重试，不回退到插画。页面隐藏时暂停渲染与时间轴。
- `/healthz` 仅用于部署就绪检查，不创建外部定时探活。不要添加持续请求站点的 uptime 保活工具。
- Railway 容器无需任何 R2 凭证；上传只在可信本机通过 Cloudflare Wrangler OAuth 进行。

## 模型更新

生产 GLB 包含 Draco 几何与嵌入 WebP 贴图，共约 159.6 MiB。建筑约 50 万面，复杂道具约 35 万面，普通道具约 18 万面；建筑与复杂道具采用 2K 贴图。按近景质量判断，不再套用 8 千面 / 512 像素的统一减面模板。

模型几何和贴图修改使用 Blender MCP。Hi3D 原始模型保留在本机 `product-city` 文件夹；本轮高精度模型、逐件预览、处理记录和可编辑 `product-city-quality.blend` 保存在同级 `quality-work` 文件夹，未提交到公开仓库。

`reference/source-models.json` 是逻辑清单；`dist/assets/models/manifest.json` 包含本次发布绑定的 URL、SHA-256 和字节数。新增版本使用新的哈希路径，不覆盖旧资源。

```sh
npm run assets:prepare -- --source /path/to/optimized/models --base https://mycity-assets.lafreze-city.workers.dev/mycity
R2_BUCKET_NAME=mycity-assets npm run assets:upload
VERIFY_ORIGIN=https://mycity.up.railway.app npm run assets:verify
npm run check
```

上传脚本仅允许 `mycity/models/` 前缀，不会清理现有 R2 对象。完成验证后再提交更新的 manifest 和部署。公开模型由 `cloudflare/assets-worker.mjs` 提供，R2 桶保持私有，`r2.dev` 不启用。Worker 只开放带哈希的模型路径，支持 GET/HEAD、Range、ETag、边缘缓存和指定来源 CORS；没有目录列表或上传接口。`config/r2-cors.json` 保留对应桶端读取策略，实际公开入口的允许来源由 Worker 管理。

发布资源入口：`npx -y wrangler@4.158.0 deploy --config cloudflare/wrangler.jsonc`。Worker 无定时触发器，只有资源请求时执行。

## 编辑作品

编辑 `dist/products.js`：名称、介绍、分类、上线日期、更新记录、状态、真实 `url`、`demo` 和联系邮箱。当前仍是示例产品；URL 为空时显示“链接待接入”。未接入真实 GitHub 产品活动。

界面仅保留作品列表、点击后的详情、年份和视角按钮；建筑名牌只在悬停或选中时显示。

`dist/props.js` 控制街道物件与居民摆放；`dist/world.js` 定义河道、船吃水和沿 X 方向的水流。人物、停放车辆保持静止，避免未绑定骨骼的模型滑行。旧城区复用游戏厅模型；状态按时间轴变化。支持建筑详情、城市成长、日夜切换、旋转缩放、河岸 / 俯瞰视角、顺流漂船、手机和减少动态效果偏好。

`reference/model-quality.json` 记录实际导出的几何、法线、贴图、哈希和桥下净空；`npm test` 检查落水、穿墙、道具穿插、桥头、车辆朝向、船首方向与 20 分钟船轨迹。浏览器隐藏时暂停动画，静态阴影只在模型加载或年份改变时更新。

## 来源

3D 模型：Hi3D MCP；模型优化与完整场景：Blender MCP。来源与生成提示词保存在 `reference/`。网站仅保留三维街区，旧插画与缩略图不再部署。原始素材仍保存在本机归档中。

Three.js 及解码器许可证随 `dist/vendor/three/` 提供。
