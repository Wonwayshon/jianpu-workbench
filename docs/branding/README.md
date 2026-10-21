# 应用标识

已选用的二胡与音符图形：琴身略向右倾，底部两道弧线略偏左，与琴弦留出空隙。

- `logo-light.png`：浅色母版。
- `logo-dark.png`：深色母版。
- `python3 scripts/icons.py`（需要 Pillow）生成网页、Android 和桌面打包尺寸。只调整尺寸和平台圆角，不重新绘制图形。
- 网页侧栏、设置与浏览器页签标识跟随 App 的显示模式。Android 提供 day/night 图片资源，由系统资源配置选择；桌面安装包默认使用浅色图标。系统启动器或 Dock 的缓存/配色不由网页显示开关控制。
- 高分辨率母版仅在源码包中保留，不放进 App 网页资源；运行时使用 256 像素图片。

## 制作记录

采用内置 ImageGen 图片编辑工具，基于用户选定稿制作；未使用外部 API Key。

最终浅色母版提示词：

> Preserve the exact emblem geometry: hooked erhu upper head, slight rightward tilt, two narrow parallel strings with rounded ends, lower two left-biased crescents with sharp tips separated from the strings by a small gap. Preserve the size and placement exactly. Only flatten the background so warm ivory #FFF9EC fills the ENTIRE square canvas uniformly including all four corners. Flat solid charcoal #252A31 emblem. No texture, gradients, shadows, redesign, additional marks, text, digits or sun. Device-specific corner masking will be handled by app packaging.

最终深色母版提示词：

> Precise color-only edit. Keep the exact geometry and placement of the gently right-leaning erhu with two strings and the two detached lower left-biased crescent arcs. Entirely opaque flat deep charcoal #1C1F26 background across the whole square canvas, including corners; emblem in solid warm ivory #F4EEDF. Same shapes, size and positions. No transparency, outer wedges, stains, markings, texture, shadows, gradients, artifacts, text, labels or sun.
