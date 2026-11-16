# 封面插画与二维码

`cover-landscape.png` 使用内置 `image_gen` 工具生成；原始生成文件已复制进入本仓库，未覆盖产品资产。未使用 API/CLI 回退。原始提示词如下：

> Create a polished original decorative background for a Chinese indie travel-weather app's mobile social launch poster. Vertical 3:4 canvas, editorial travel journal / refined flat paper-cut style, quiet warm ivory #F6F3E9 background, deep pine green #244E41, sage green #BBC9A6 and muted apricot #E8AE68 accents. Extremely restrained composition: top-left 65 percent is nearly empty clean ivory for typography; bottom-left and lower right have softly layered green hills, a tiny winding path, a small sun near upper-right with a delicate circular orbit, a couple of small cream clouds. Fine natural paper grain, subtle organic shapes, airy premium Japanese travel magazine mood. Main decorative content confined to the lower-right and edges, lots of breathing space, no busy texture, no photographic scenery. NO text, NO letters, NO numbers, NO logos, NO phones, NO interfaces, NO watermark, NO stars or random decorative confetti. This is just an abstract atmospheric backdrop; precise Chinese copy and actual UI will be typeset separately.

`try-qr.png` 是本机 `qr.swift` 通过 macOS CoreImage 生成的机器可读二维码，附带四模块白色静区。通过 Vision 框架分别验证原图与排版导出后的第六张成图，回读地址与 `post.md` 相同；没有使用生成式图片工具绘制二维码。
