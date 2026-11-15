# 按需共享天气：非 PostgreSQL 存储可行性验证

后续进展见 [2026-11-16 按需候选检查](on-demand-object-cache.md)：实际缓存及预算/租约已实现，但冷启动约 42 秒且有缺失，账单 PG 计算还出现未归属的增长。静态存储和原语可行不等于运行与成本验收通过；前端保持关闭。

2026-11-15。用户决定全部地点均按需更新，精选 48 点也不定时刷新或预热。本轮完成存储与并发原语验证，**尚未实现或上线新的共享天气缓存**。线上天气继续使用 v0.8.1 恢复的浏览器直连及一小时本机缓存，旧 PG 实验保持关闭。

## 已核对的独立静态存储路径

通过 `DescribeStaticStore` 读取当前应用的静态托管资源，上海区，独立静态桶，`ExternalStorage.Enabled=false`。使用现有 `/sunseek` 挂载，不创建新环境、存储桶或套餐。CLI 的静态 hosting 上传走 COS，`fileId=false` 跳过云存储文件元数据接口；该路径与 PG 模式 Storage SDK 不同。

在 `_weather-storage-probe/<UUID>/` 上传两个仅作连通性检查的小文件，原始 JSON 1,091 bytes。两个独立 Chromium 上下文经原测试站分别读回原始数据并校验，HTTP 200，本次耗时约 563 / 243 ms。gzip 小文件也可直接读取并在浏览器解压；服务器未自动解压该扩展名，响应无 `Content-Encoding`。测试文件已删除。

此测量只说明文件分发可用，不是完整天气缓存的首屏速度或 CDN 命中证明。观察到 `Cache-Control: public, max-age=300, s-maxage=600`；未来天气读取仍须检查文件内真实 `fetchedAt/baseDate/profile`，不能把旧 CDN 内容续期。

## 云函数临时角色直接读写

创建独立、无公开 URL、无定时器的短期 Event 诊断函数，仅导入 Node 内置模块，使用现有 `TCB_QcsRole` 下发的运行时临时凭据签名访问 COS XML API。没有永久密钥、PG Storage SDK、SQL、天气或业务函数调用；没有修改角色策略。

实际读写成功：两次有效诊断中 GET 约 60 / 56 ms，普通 PUT 约 272 / 169 ms。测试对象与诊断函数均已清理；一次初始部署因本地相对代码目录失败，确认没有遗留函数后改为绝对目录。

## 并发检查：不能把禁止覆盖当作锁

第一次两个同时创建的 PUT 都返回 200，第二次为 200 / 409 FileAlreadyExists。因此，不能将 `x-cos-forbid-overwrite` 直接作为已证明可靠的原子租约；也不能仅因第二次成功互斥就忽略第一次结果。最后一次诊断没有返回版本 ID，不能把首次失败归因于桶开启了版本控制。

进一步测试 APPEND 的位置比较：两个独立 HTTP 请求都要求 position=0，返回 **200 / 409 AppendPositionErr**；完成后再次提交 position=0，仍返回 **409 AppendPositionErr**。这符合位置与对象长度必须相等的约束，可作为后续元数据 CAS 原型的候选，而非已完成的分布式缓存。初版诊断仅识别另一种位置错误名，已根据真实响应及官方错误码补充 `AppendPositionErr`。

下一阶段需基于此完成并验证：实例重建后的共享复用、并发租约与过期接管、迟到写入隔离、跨午夜基准日、持久上游预算、429 暂停与恢复，以及压缩天气文件按需分发。重点验证 APPEND 不同位置更新的竞争与故障恢复，不仅测试首次创建。

## 消耗与验证边界

本轮仅使用小型合成对象和少量临时函数调用，未拉取真实天气或执行 PostgreSQL 查询。对象请求、文件流量/存储及函数运行仍可能计费，不宣称零成本；未等待账单统计延迟结束，因此没有给出已经实测的月费用保证。实现真正业务链路后还需复核账单。

所有检查默认离线预览，只有显式 `--live` 才操作云端：

```sh
python3 scripts/probe_weather_storage.py
python3 scripts/probe_weather_function.py
# 小文件分发验证，结束删除 UUID 目录
python3 scripts/probe_weather_storage.py --live
# 临时函数读写与并发检查，结束删除对象及诊断函数
python3 scripts/probe_weather_function.py --live
python3 tests/weather_storage_probe.py
.tools/node/bin/node tests/weather_object_probe.cjs
```

上述命令不是日常网站发布所需步骤，不要循环运行以观察余额。没有启用任何定时刷新，也未更新旧天气函数或数据库。

官方依据：[静态托管与 CDN](https://docs.cloudbase.net/hosting/introduce)、[PG 模式 Storage 元数据路径](https://docs.cloudbase.net/storage/pg/introduce)、[COS 请求签名](https://cloud.tencent.com/document/product/436/7778)、[禁止覆盖的适用范围](https://cloud.tencent.com/document/product/436/7749)、[AppendPositionErr 错误说明](https://intl.cloud.tencent.com/ind/document/product/436/7730)。
