# 一条命令更新现有腾讯云网站

工具归档于 v0.7.0；用户目前暂缓网页更新。当前应用通过控制台文件上传建立，使用 **应用部署** `tcb app deploy` 更新，保留同一应用和网址。不使用普通文件目录上传命令来替代应用更新；两者在版本记录和应用域名上存在差别。依据 [官方应用部署文档](https://docs.cloudbase.net/cli-v1/app/management)，已用本地安装的 CLI 3.9.2 `--help` 核对参数。

## 当前项目：首次登录一次

在项目根目录的终端运行：

```sh
python3 scripts/deploy_tencent.py login
```

会打开腾讯云浏览器授权页面，按提示完成一次授权即可。无需把密码或 SecretKey 发到对话里。登录由官方 CLI 管理，不会把凭据写入仓库或网站包。

接着可查询现有应用：

```sh
python3 scripts/deploy_tencent.py status
```

## 以后有修改：一条命令更新

```sh
python3 scripts/deploy_tencent.py deploy
```

脚本自动整理最新运行文件，再更新已有应用。目标已写入 `scripts/tencent-target.json`：

- 环境：`noisy-sole-d5ganycu813519dcc`
- 应用：`sunseek`
- 网址：<https://sunseek-noisy-sole-d5ganycu813519dcc.webapps.tcloudbase.com>
- 路径：`/`

每次先查询云端应用，核对名称、部署类型、网址和路径；查询失败或目标不符即停止，不自动创建另一个站点。只上传当前 HTML、CSS、6 个运行脚本和 `assets/`，与 ZIP 打包复用同一白名单。Git、测试、开发文档、本地工具和配置不会进入上传目录。安装/构建命令为空，框架为 static，不增加 Node 后台、数据库、账号系统或付费服务。

已确认目标后使用 `--force` 更新同一应用的内容。执行发布会替换线上代码，先完成相关检查再运行。平台发布生效后刷新访问，原有 5 分钟浏览器缓存可能让旧页面短暂保留；首次核对可用无痕窗口或强制刷新。

## 只预览，不上传

```sh
python3 scripts/deploy_tencent.py deploy --dry-run
```

输出目标、文件数、体积和实际 CLI 参数，不联网、不登录、不上传。单独 ZIP 包仍可用 `python3 scripts/package_static.py /tmp/sunseek-tencent-static.zip` 生成。

## 换电脑后的一次安装

当前工作区已经安装，无需重复安装。新 checkout 时运行：

```sh
python3 scripts/setup_cloudbase.py
python3 scripts/deploy_tencent.py login
```

安装工具从 Node.js 官方下载对应平台发行版并核对 SHA-256，使用项目内 `.tools/` 放置 Node.js 与 CloudBase CLI；版本记录在 `scripts/cloudbase-tools.json`。`.tools/` 已被 Git 忽略，不改变全局 Node.js。脚本支持 macOS/Linux arm64/x64，需要 Python 3.12+ 和系统 curl；CLI 正常运行不改变网站原生 HTML/JS 的技术栈。工具信息参考 [官方安装说明](https://docs.cloudbase.net/cli-v1/install)。

## 当前验证状态

CLI 安装和版本、应用命令参数、无网络发布预览已检查。`tests/deploy.py` 验证错误目标停止、预览零云请求、运行文件白名单和 static 参数。官方设备码流程已返回 login succeeded，但未取得环境列表信息。用户随后明确选择“暂时只保留本地修改”，已停止后续流程，没有查询目标或执行发布。下次用户明确要求同步时，先检查现有登录状态、核对目标应用/地域；登录过期才重新授权，不复用旧设备码。实际发布及线上验收仍待进行。

## v0.8.0 共享服务单独更新

共享函数已经部署，当前静态网页仍暂缓同步。服务端源文件位于 `server/`，不属于静态运行白名单，不要上传到静态站。仅维护后端时使用：

```sh
python3 scripts/deploy_weather_cache.py init-db
python3 scripts/deploy_weather_cache.py deploy --coverage all
python3 scripts/deploy_weather_cache.py function-url
python3 scripts/deploy_weather_cache.py status
```

只有明确同步网页时再运行原 `deploy_tencent.py deploy`。函数入口为精确 Function URL，不创建通配网关；无需永久 API Key。详见 [缓存实现](shared-weather-cache.md)。
