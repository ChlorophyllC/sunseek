# 晴游 · 小红书手机首发素材

2026-11-16。定位为个人作品分享与小范围试用，沿用产品米白、森林绿和暖橙配色。主线是“先找好天气，再决定去哪”，不宣传未启用的共享缓存，也不承诺天气一定发生。

## 直接使用

- `post.md`：推荐标题、两个备选标题、可直接复制的正文、体验入口和发布说明。
- `exports/01-cover.png` 至 `06-try.png`：六张 1080 × 1440、3:4 竖版 PNG，按文件编号使用。
- `overview.png` / `overview.html`：六图总览。
- `sunseek-xiaohongshu-launch.zip`：六张成图与文案的下载包，可重新生成，未重复提交 Git。

默认标题：**周末去哪？我做了个追好天气的小工具**。

内容顺序：封面 → 日期/天气偏好 → 地图 → 出发日期建议 → 县镇/岛屿搜索 → 小范围试用入口。

## 内容与来源

手机界面来自当前项目在 390 × 844 手机视口、2 倍像素下的实际网页截图。使用产品本身的“体验演示模式”，天气图表、温度、日期建议和分数均为示例，并在成图及正文中标明。没有用合成 UI 替代产品功能。

截图脚本拦截全部外部请求，未查询真实天气、数据库或计费。来源记录在 `screens/manifest.json`。地图、地名与图标沿用产品已有数据来源；搜索截图保留 GeoNames / CC BY 4.0 字样。本套成图没有使用第三方旅行照片。

封面背景为内置 image_gen 工具生成的原创装饰插画，见 `art/cover-landscape.png`；精确中文文案、页面编号、产品截图与二维码由 HTML/CSS 排版，生成提示词保存在 `art/README.md`。

二维码直接指向现有腾讯云测试站：

`https://sunseek-noisy-sole-d5ganycu813519dcc.webapps.tcloudbase.com`

已在本机分别识别二维码原图和最终 `06-try.png`，均回读为上述地址。识别二维码不访问对应网站；没有为核查反复请求在线服务。发布前仍建议用自己的手机确认打开体验，以及腾讯云首次访问提示。

## 修改与导出

修改 `slides.html` 中的标题、说明和样式，再运行导出；二维码目标改变时须先重新生成并校验。脚本需要本机 Python Playwright，二维码脚本使用 macOS 图像框架，不安装新的项目依赖。

从仓库根目录运行：

```sh
# 本地站点已运行则无需再启动
python3 -m http.server 4173
```

另一终端执行：

```sh
# 如只改文案/排版，不必重截产品界面
python3 marketing/xiaohongshu/launch-01/capture.py
python3 marketing/xiaohongshu/launch-01/render.py

# 核验最终成图中的二维码，不访问网址
swift -module-cache-path /tmp/sunseek-swift-cache marketing/xiaohongshu/launch-01/qr.swift --verify marketing/xiaohongshu/launch-01/exports/06-try.png 'https://sunseek-noisy-sole-d5ganycu813519dcc.webapps.tcloudbase.com'
```

检查结果：六张尺寸均为 1080 × 1440、无缺失图片、人工查看总览及成图、最终二维码回读正确。没有新增网站功能、发布网站或代发小红书。
