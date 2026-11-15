# 跨用户共享天气缓存：实现与运维

v0.8.0 历史实验的实现说明。共享后端仍部署在现有腾讯云体验环境，覆盖 506 个公开采样点；**v0.8.1 已发布原测试站，默认关闭共享路径，恢复浏览器直连和一小时本机缓存**。以下行为和命令仅适用于显式启用的实验路径，不能作为当前默认行为。最新状态见 [查询恢复记录](weather-query-recovery.md)。

**成本状态更新：用户账单已确认 PostgreSQL 计算是主要消耗。此前功能验收不能作为免费额度够用的证明。共享实例的每个活跃五分钟窗口按 0.5 核计量，当前上海区约 14.25 点/窗口，不能再按毫秒级 SQL 耗时或 4.7MB 容量估计成本。保留已部署后端，未进行删除、变配或自动停用；停止重复云端全库验收，默认前端已停用该路径；重新接入前必须重新设计并验证成本。详见 [成本复核](tencent-cloud.md)。**

## 显式启用实验时的行为

- 缓存按地点保存，不按全国/省份页面保存。第一次成功获取后有效一小时，读缓存不延长获取时间。
- 进入山东只补取山东缺失/过期地点；其他用户可复用这些地点，全国仍是固定 48 个精选候选。
- 默认和主动重试都访问共享服务；不开放强制清除公共缓存的参数。
- 个人地点、临时预览仍使用原有浏览器直连路径。足迹、收藏、笔记、出发地和筛选偏好不上传共享服务。
- 一小时内的公共预报仍由浏览器按自己的日期/偏好评分；失败时最多保留六小时以内的同版本缓存，并显示“缓存预报”。过期、不完整和危险天气不伪装成有效推荐。
- 仅按需填充，没有每小时刷新全库的任务。全库只是允许查询 506 个地点，不是每个访问者都自动下载全库。

## 当前云端资源

| 项目 | 已核对结果 |
| --- | --- |
| 环境 | `noisy-sole-d5ganycu813519dcc`，`ap-shanghai` |
| 套餐 | `baas_trial` 体验版，有效期至 2027-05-14 23:59:59；超额使用关闭 |
| 函数 | `sunseek-weather-cache`，Event / Nodejs20.19 / 256MB / 30 秒，实际配置已读回验证 |
| 持久层 | 环境已有 PostgreSQL；未创建文档数据库或新环境 |
| HTTPS 入口 | `https://1330730699-86nlrqp1le.ap-shanghai.tencentscf.com/api/weather` |
| 前端入口 | `assets/weather-client.js`，本地及测试站默认关闭；仅显式设置 `SUNSEEK_WEATHER_SERVICE.enabled=true` 时启用 |

未变更套餐、购买资源包、开超额计费、配置永久密钥或新增账号服务。函数使用 `TCB_QcsRole` 的运行时临时凭据签名访问数据库，浏览器无需密钥或匿名登录 SDK。

普通 HTTP 网关不允许手工修改平台内部默认域名。通配域名路由也被自动审批拒绝，因此采用**仅绑定一个函数的 Function URL**，没有创建 `*` 网关路由。Function URL 的 CORS 只允许现有晴游站点、`http://localhost:4173` 和 `http://127.0.0.1:4173`。公开天气无需用户身份认证；CORS 不是鉴权，真正的上游保护来自固定地点目录、固定查询参数、逐地点锁和全局配额。

## 数据与并发规则

`server/weather-cache/catalog.json` 从浏览器实际地点目录生成，包含 48 个精选与其余基础点，共 506 个。坐标、字段、单位、16 天覆盖、时区和契约版本组成逐地点 profile 哈希。每次读缓存还检查 `Asia/Shanghai` 基准日，跨午夜不能复用上一基准日的数据。

三个私有表：

- `sunseek_weather_cache`：逐地点原始预报、真实获取时间、配置哈希、基准日、租约与失败冷却。
- `sunseek_weather_budget`：全局串行预留入口与限流暂停状态。
- `sunseek_weather_usage`：最近 24 小时的加权请求预留账本，索引按时间；按滚动窗口计算，避免整点双倍突发。

表启用 RLS，撤销 `anon/authenticated/PUBLIC` 的直接读写。三个 SQL 函数是 `SECURITY INVOKER`，撤销公开执行权限；不创建可匿名调用的管理员 RPC。

一次最多 16 个已知地点 ID，去重排序。服务端事务原子取得逐地点 45 秒租约，并先预留上游额度，再发请求。多个函数实例碰到同一点时，其他请求得到已有缓存或 pending，浏览器有上限地等待；不会重复回源。写入校验租约 owner 和有效期，旧 worker 不能覆盖新的结果。

新鲜数据可在实例内作热缓存，但 PostgreSQL 始终是跨实例的持久来源。HTTP 响应保留逐地点 `fetchedAt/expiresAt`；浏览器把该获取时间持久保存，不能用收件时间续期。普通完整响应的共享缓存头最多 300 秒且不越过最早地点失效时间；pending/错误为 `no-store`。Function URL 没有实测 CDN 命中，不能把这些响应头当作 CDN 已配置的证据。

## 上游稳定性与预算

原来的 Node fetch 在本环境曾出现连接失败。当前使用原生 HTTPS、明确 IPv4、连接阶段超时与有限连接重试；HTTP 已连通后的失败不会在同一额度预留内重复提交。每个上游请求最多 8 点，前端一次 16 点时最多并行两个上游请求，单次受 22 秒总信号约束，函数配置 30 秒。

局部成功独立写入，其他点失败不丢弃成功点，也不覆盖已有预报。普通失败冷却 60 秒；429 触发共享全局暂停并遵守可用的 Retry-After。浏览器在服务整体不可用或配额受限时停止剩余队列，保留本地有效缓存，不自动改成所有用户一起直连上游。

按当前 17 个变量、16 天和单模型请求，`ceil(17/10 × 16/14) = 2` 个加权单位/地点；一分钟/一小时/24 小时滚动预留上限分别为 400/4000/8000。预算在真正发请求前保留，失败也不返还；新增字段或模型时需要同时调整计量。依据 [Open-Meteo 计量说明](https://open-meteo.com/en/pricing) 与 [免费调用限制](https://open-meteo.com/en/terms)，预留余量，供应商实际限流仍优先处理。

不能持续预热全部 506 点：即便只按每点一次计量，每小时全库刷新也超过每日一万的量级。当前仅让实际访问的地点更新，后续应观察真实需求后再决定是否预热精选。

数据库使用 [ExecutePGSql](https://cloud.tencent.com/document/product/876/130469) 管控面 API，官方默认限制 20 次/秒。原方案只考虑了每天 50 人以内的接口吞吐，未充分评估数据库的计算计量粒度，不能据此认定成本合适；热缓存可减少数据库调用，但不宣称具备高并发能力；访问量增长后应迁移到数据面连接池/RPC，并配置经核实的入口限速。不能通过开放数据库写权限解决限频。

## 原始空值与浏览器缓存

本次真实接口在当地零点后，16 天/384 小时的原始时间轴存在，但第 16 天的一些字段为 null，48 个精选经过原引擎过滤后只有 15 个有效日。这是供应商当前覆盖情况，不补零、不替换示例，也不宣称 16 天均完整。

浏览器缓存额外记录原请求的 `baseDate`，因此末日缺失不会导致一小时内反复查询。旧缓存没有该字段时保留原来的检查路径；重新成功读取后写入。缺失日期仍显示不完整，不进入相应行程推荐。浏览器自身的 160 万字符容量限制与优先保存策略不变。

## 命令

```sh
# 校验服务端目录与浏览器地点配置一致
.tools/node/bin/node scripts/build_weather_catalog.cjs --check
# 第一次建表或更新专用 schema（幂等，不清空天气）
python3 scripts/deploy_weather_cache.py init-db
# 第一阶段，已完成真实验收
python3 scripts/deploy_weather_cache.py deploy --coverage featured
# 当前阶段，开放全部公开采样点
python3 scripts/deploy_weather_cache.py deploy --coverage all
# 仅读取/首次创建本函数自己的精确 URL，不创建通配网关
python3 scripts/deploy_weather_cache.py function-url
python3 scripts/deploy_weather_cache.py status
# 在事务中验证真实 SQL，最后回滚
python3 scripts/deploy_weather_cache.py verify-db
```

以上命令只操作缓存后端。静态网页更新仍使用 `python3 scripts/deploy_tencent.py deploy`，两者相互独立，不要把服务端源文件放进静态部署包。

## 验证

常规测试不访问真实天气或云账户：原 16 组回归之外，新增 `tests/shared_weather.py`（两个独立浏览器、48/省份/全库、pending、手动重试、限流停止、故障不直连、末日空值刷新）、`tests/shared_weather.cjs`（核心 TTL/并发/午夜/配置与失败）、`tests/shared_weather_http.cjs`（两种事件格式和来源/方法/参数/缓存头边界）。

真实云端验收包括 SQL 事务回滚检查、48 点两轮调用、两个独立浏览器直接访问 HTTPS 服务及全库两轮调用。真实检查会按需占用天气配额，必须主动执行：

```sh
python3 scripts/check_weather_cache.py --coverage featured
python3 scripts/check_weather_cache.py --coverage all
python3 tests/shared_weather_live.py --live
```

验收过程的冷数据可能出现上游慢响应和一分钟冷却；脚本只补失败点，直到完成或达到有限重试上限。详细结果见 [v0.8.0 验收记录](shared-weather-validation.md)。
