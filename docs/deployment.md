# 部署记录

- GitHub：`Lafreze/mycity`，`main`
- Railway Project：`82392fb3-2162-4336-bdee-68d095013b64`
- Railway Service：`0bcbc763-7082-4c0b-9588-3a1ffe23f43a`
- Railway Environment：`eeb98d60-9cba-4a60-865d-202c75636b75`（production）
- 站点：https://mycity-production-8226.up.railway.app
- Cloudflare R2 Bucket：`mycity-assets`（APAC；私有，r2.dev 关闭）
- 只读缓存 Worker：`mycity-assets`
- 模型入口：https://mycity-assets.lafreze-city.workers.dev/mycity/
- 资产清单版本：`a7df77cd7e643298`，51 GLB，包含全部嵌入贴图。

模型从 R2 读取并在 Cloudflare 边缘缓存，不经过 Railway。所有 R2 对象使用最终文件 SHA-256 前 16 位命名，保留已有版本以便回滚。Worker 只接受模型哈希路径，不提供目录列表、上传、代理任意 URL 或管理接口。Cloudflare 保持现有 Free 方案，没有升级套餐。

Railway 使用单进程 Nginx、单副本和 Serverless。配置文件中的限制为最多 0.5 CPU / 128 MiB 内存，没有数据库、卷、计划任务或保活客户端。休眠由 Railway 检测静默流量决定；首次访问会有冷启动，不能据此承诺整个平台账单为零。

部署使用仓库根目录的 Dockerfile。更新页面后先运行 `npm run check && npm test`；模型变化另需执行准备、上传、完整哈希验收，再推送与部署。R2 上传凭据仅由本地 Wrangler 管理，不复制到 GitHub 或 Railway。

参考：
- https://docs.railway.com/deployments/serverless
- https://docs.railway.com/config-as-code/reference
- https://developers.cloudflare.com/r2/api/workers/workers-api-reference/

验收：2026-11-05T13:28:50.470Z，51 个模型逐个验证完整下载 HTTP 200、SHA-256、大小、MIME、缓存、CORS、HEAD 和 Range；完整下载与分段请求分别返回 200 / 206。
