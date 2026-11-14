# 精选城市实景图片与来源

核对日期：2026-11-14。48 个精选目的地各使用一张独立照片，生成卡片和详情两个 WebP 版本，共 96 个资源，合计 7,625,664 bytes（约 7.6 MB）。卡片图合计 1,936,662 bytes，详情图合计 5,689,002 bytes。每张卡片图不超过 50,000 bytes，详情图不超过 150,000 bytes；这是体积上限，不保证固定画质或固定尺寸。

## 来源与许可

照片来自 Wikimedia Commons，依据每张文件说明页分别核对作者、地点描述和许可；不把 Commons 本身当作统一图片许可。采用 CC BY、CC BY-SA、CC0 或明确标示为公有领域的作品。原图文件名、作者、描述、日期、来源版本时间与 SHA-1、实际下载文件的 SHA-256、输出尺寸/体积/摘要均记录于 [`assets/city-images.json`](../assets/city-images.json)。

图片经过裁剪、缩放和压缩，衍生图片沿用各自原图许可；CC BY-SA 图片的修改版本继续按对应版本的 CC BY-SA 提供。图片许可不意味着整个网站代码适用该许可。页面在推荐卡片、对比图片上提供作者和许可链接，详情头图之后给出完整署名、来源、许可和修改说明。再次使用图片时也应保留相应信息。

核对依据为文件页中的地点说明与实际画面，不使用随机照片、国旗、地图或生成图片冒充城市实景。实景照片可能拍摄于较早年份，并非实时天气、实时城市景观或特定季节的承诺。具体拍摄日期见来源与清单；例如香港全景拍摄于 2007 年。

来源使用规则参考 [Commons 外部复用说明](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)。运行网站不会向 Commons 请求图片，只有读者主动点击来源/许可链接才跳转到外部网站。

## 展示与回退

- `assets/city-images.json` 是维护入口；`assets/city-images.js` 是生成的浏览器索引，通过城市 ID 统一供 `placeVisual()` 使用。
- 推荐卡片和对比表使用最大 640 × 400 的卡片图，详情使用最大 1280 × 720 的详情图；不放大低分辨率原图。图像细节过多时，逐步调整质量和尺寸以满足体积上限。
- `position` 设置画面焦点，适应桌面宽头图和手机竖卡片。图片自身先居中裁剪，页面再用 `object-fit: cover` 适配容器。
- 普通/自定义地点没有图片配置时保留地点示意。原有意境图仍明确标为“非对应城市实景”，首页装饰继续使用原意境图。
- 加载失败时隐藏破图与对应图片署名条，回退到地点示意；详情同步标识“图片暂不可用”。详情中的来源信息仍可查看。
- 所有资源使用相对路径，可在仓库子目录下运行。

## 重建与验收

正常运行不需要 Pillow、下载原图或执行构建。更新图片时先人工核实新图的地点和许可，再修改清单，不能自动刷新城市页面的默认图片。

```sh
python3 -m pip install Pillow
python3 scripts/build_city_images.py /tmp/sunseek-photo-sources --download
python3 tests/city_images.py
```

本次使用 Pillow 12.3.0。`--download` 只下载缺失的缓存；不带此参数只使用本机缓存，离线重建。大原图/下载文件留在指定缓存目录，不提交到仓库。下载摘要与清单不符时脚本拒绝重建，需要重新核对来源。图片接口可能限流；应按服务响应等待，或选用同一文件的官方标准尺寸版本，并核对和更新清单，不能改用无关图片。

脚本完成后更新输出摘要与运行时索引。换图后检查实际画面和手机裁剪，不以文件解码成功代替人工检查。专项测试覆盖全部 96 个资源、来源记录、体积和摘要，三处展示、来源链接不触发卡片打开、对比移除按钮、失败回退、普通地点回退、360/390/768/1440px 布局，以及 `/sunseek/` 子路径资源。

## 逐城清单

以下许可链接及源文件页构成图片来源索引；完整版本证据与摘要见 JSON 清单。

| 城市 | 实景内容 | 作者 | 许可 | 源文件 |
| --- | --- | --- | --- | --- |
| 大理 | 崇圣寺三塔 | Andrew and Annemarie | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Chongsheng_Temple_(11050634113).jpg) |
| 丽江 | 黑龙潭与玉龙雪山 | Miltos Gikas from Lutsa, Attiki, Greece | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Black_Dragon_%E9%BB%91%E9%BE%99%E6%BD%AD_(5496141333).jpg) |
| 三亚 | 亚龙湾全景 | Anna Frodesiak | [Public domain](https://creativecommons.org/publicdomain/mark/1.0/) | [文件说明](https://commons.wikimedia.org/wiki/File:Yalong_Bay_01.jpg) |
| 昆明 | 五华区城市景观 | 瑞丽江的河水 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:%E4%BA%94%E5%8D%8E%E5%8C%BA%E5%A4%A9%E9%99%85%E7%BA%BF_-_%E8%88%AA%E6%8B%8D_-_2025-05-16_04.jpg) |
| 厦门 | 城市滨水天际线 | Jay Huang from Pleasanton, USA | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Xiamen_night_cityscape_2018_-_Flickr_-_Jaykhuang.jpg) |
| 成都 | 远山与城市天际线 | FISU | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0) | [文件说明](https://commons.wikimedia.org/wiki/File:%E9%9B%AA%E5%B1%B1%E4%B8%8B%E7%9A%84%E6%88%90%E9%83%BD%E5%B8%82%E5%A4%A9%E9%99%85%E7%BA%BF_Chengdu_skyline_with_snow_capped_mountains.jpg) |
| 杭州 | 西湖三潭印月与雷峰塔 | Takashishin | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:West_Lake,_Hangzhou_2025.jpg) |
| 北京 | 天坛祈年殿 | Shujianyang | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Temple_of_Heaven_20160323_01.jpg) |
| 上海 | 黄浦江畔城市景观 | xiquinhosilva | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Huangpu_Park_20124-Shanghai_(32208802494).jpg) |
| 广州 | 广州塔 | Tim Wu | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Canton_Tower_20241027.jpg) |
| 深圳 | 福田城市天际线 | Charlie fong | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Commercial_area_of_futian_to_east2020.jpg) |
| 珠海 | 凤凰山所见城市景观 | Chinyen Lu | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:%E4%BB%8E%E5%87%A4%E5%87%B0%E5%B1%B1%E8%BF%9C%E7%9C%BA%E7%8F%A0%E6%B5%B7%E4%B8%BB%E5%9F%8E%E5%8C%BA.jpg) |
| 海口 | 骑楼老街 | Yolanda Yao | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Altstadt_von_Haikou_(Hainan).jpg) |
| 桂林 | 象鼻山 | xiquinhosilva | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Xiangshan_Scenic_Area_89468-Guilin_(31130832628).jpg) |
| 南宁 | 青秀区民歌湖与城市建筑 | EditQ | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Skyline_of_China-ASEAN_Business_Center_in_Qingxiu_District.jpg) |
| 重庆 | 山城滨江景观 | Renek78 | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) | [文件说明](https://commons.wikimedia.org/wiki/File:September_2025_in_Chongqing_05.jpg) |
| 贵阳 | 金融城建筑群 | Ryedamien | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Guizhou_Financial_City_District.jpg) |
| 拉萨 | 布达拉宫 | Pavel Špindler | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Lhasa_-_Pot%C3%A1la_-_panoramio.jpg) |
| 南京 | 玄武湖与城市天际线 | Jackeylove333 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Xuanwu_Lake_and_Nanjing_Skyline.jpg) |
| 苏州 | 东方之门 | 铁头娃蛤蛤 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:%E4%B8%9C%E6%96%B9%E4%B9%8B%E9%97%A81.jpg) |
| 福州 | 台西中央商务区 | Listwiseafford | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Fuzhou_Taixi_CBD.jpg) |
| 青岛 | 海港与沿岸建筑 | xiquinhosilva | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Qingdao_Harbour_51341-Qingdao_(49055637186).jpg) |
| 济南 | 中央商务区天际线 | Ucabunx | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Skyline_of_CBD,_Jinan,_China.jpg) |
| 合肥 | 天鹅湖 | 钉钉 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:%E5%A4%A9%E9%B9%85%E6%B9%96.jpg) |
| 黄山 | 屯溪老街 | EditQ | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:%E5%AE%89%E5%BE%BD%E9%BB%84%E5%B1%B1%E8%80%81%E8%A1%97_2.jpg) |
| 南昌 | 滕王阁与城市夜景 | Akira CA | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Nanchang_Skyline.jpg) |
| 武汉 | 黄鹤楼俯瞰城市 | 螺钉 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:%E6%AD%A6%E6%B1%89%E9%BB%84%E9%B9%A4%E6%A5%BC%E4%BF%AF%E7%9E%B0.jpg) |
| 长沙 | 岳麓山爱晚亭秋景 | Junchong | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:%E7%88%B1%E6%99%9A%E4%BA%AD%EF%BC%88%E7%A7%8B-%E4%BE%A7%E9%9D%A2%EF%BC%89.jpg) |
| 张家界 | 武陵源天子山峰林 | chensiyuan | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:1_tianzishan_wulingyuan_zhangjiajie_2012.jpg) |
| 郑州 | 郑东新区城市景观 | 白诗棋 | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) | [文件说明](https://commons.wikimedia.org/wiki/File:Zhengzhou_CBDcity.jpg) |
| 西安 | 古城墙 | xiquinhosilva | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件说明](https://commons.wikimedia.org/wiki/File:City_wall_of_Xi%27an_51550-Xian_(27959363326).jpg) |
| 兰州 | 黄河两岸城市天际线 | Megalizard29 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Skyline_Lanzhou_August_2025.jpg) |
| 西宁 | 城中区城市建筑 | xiquinhosilva | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Skyscrapers_in_Chengzhong_District,_Xining_(53727167629)_-_2024.jpg) |
| 银川 | 金凤区城市天际线 | xiquinhosilva | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Skyline_of_Jinfeng_District,_Yinchuan_(53724463112).jpg) |
| 乌鲁木齐 | 红山所见城市景观 | Albertaont | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Urumqi_Skyline_July_2019.jpg) |
| 阿勒泰 | 阿勒泰市区 | 陈琛 | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [文件说明](https://commons.wikimedia.org/wiki/File:%E6%96%B0%E7%96%86%E9%98%BF%E5%8B%92%E6%B3%B0%E5%B8%82._-_panoramio.jpg) |
| 呼和浩特 | 振华广场 | Jonashtand | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:20240812_Arriving_in_Hohhot_ROTATEEDIT.jpg) |
| 太原 | 城市天际线 | xiquinhosilva | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Taiyuan_xiquinhosilva.jpg) |
| 石家庄 | 正太广场 | E2568 | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) | [文件说明](https://commons.wikimedia.org/wiki/File:Zhengtai_Square_1.jpg) |
| 天津 | 天津之眼与城市夜景 | KangTyngrwey | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Tianjin_Eye_and_Tianjin.jpg) |
| 哈尔滨 | 松花江与城市景观 | xiquinhosilva | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件说明](https://commons.wikimedia.org/wiki/File:26935-Harbin_(29661238117).jpg) |
| 长春 | 地质宫 | N509FZ | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Changchun_Geological_Palace_(20230723154904).jpg) |
| 长白山 | 西坡所见天池 | Antigng | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件说明](https://commons.wikimedia.org/wiki/File:%E4%BB%8E%E9%95%BF%E7%99%BD%E5%B1%B1%E8%A5%BF%E5%9D%A1%E7%9C%8B%E5%A4%A9%E6%B1%A0-2017-08-24_1.jpg) |
| 沈阳 | 青年公园 | E2568 | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) | [文件说明](https://commons.wikimedia.org/wiki/File:%E6%B2%88%E9%98%B3%E9%9D%92%E5%B9%B4%E5%85%AC%E5%9B%AD.jpg) |
| 大连 | 西岗区滨海城市景观 | Fumihiko Ueno | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Xigang,_Dalian,_Liaoning,_China_-_panoramio_(18).jpg) |
| 香港 | 太平山所见维多利亚港全景 | Diliff | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Hong_Kong_Skyline_Restitch_-_Dec_2007.jpg) |
| 澳门 | 大三巴牌坊 | GG001213 | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) | [文件说明](https://commons.wikimedia.org/wiki/File:%E5%A4%A7%E4%B8%89%E5%B7%B4%E7%89%8C%E5%9D%8A.jpg) |
| 台北 | 象山所见城市天际线 | 毛貓大少爺 | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) | [文件说明](https://commons.wikimedia.org/wiki/File:Taipei_Skyline_2022.06.29.jpg) |
