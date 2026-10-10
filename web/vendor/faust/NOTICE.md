# Faust 候选音色

只分发预编译的 DSP 模型，不分发 Faust 编译器、在线编辑器或录音采样。浏览器、Android 和桌面共用同一份模型与 Web Audio 播放时钟。

管笛与弓弦模型改编自 Romain Michon 的 Faust-STK `flute.dsp`、`bowed.dsp`：

- 上游固定提交：`grame-cncm/faust@8c00913e44d42f9d25aa3f1a0d500bde5662d7bc`
- 原版权：Romain Michon。算法来源：Perry R. Cook、Gary P. Scavone 的 STK，Julius O. Smith 等人的数字波导研究。
- 上游模型声明 STK-4.3 / MIT 风格许可。保留 `LICENSE-STK.txt` 中的 STK 许可与此版权声明。
- 修改内容：移除插件 GUI、非线性调制、立体声扩展和模型自带混响；保留单声道波导核心，校准延迟，提供少量音色参数；起止包络、移调、颤音、混响由本项目管理。
- 本项目的敲弦模型使用弦的非谐性分音与 Faust 模态共鸣滤波器，为原创新模型，GPL-3.0-only。

构建依赖锁定为 `@grame/faustwasm@0.19.0`（LGPL-3.0），所带 Faust 编译器为 2.90.0。标准库保留各文件许可；数学、滤波等库的 LGPL 许可含 Faust 生成代码例外，允许另选生成代码许可。实际使用的版权与许可摘录见 `LIBRARY-NOTICES.txt`。编译器本身仅用于开发，不进入安装包。

可编辑源码在 `source/`。执行 `npm ci`、`npm run build:faust` 重新生成 `models.js`；源代码 SHA256、编译器版本和 WASM 字节数保存在生成文件中。正常网页、Android、桌面构建直接使用该文件，无需运行编译器。

管笛、弓弦、敲弦分别有两种候选设置。它们不是实录竹笛、二胡或扬琴音色；默认仍保留原音色，用户在试听后明确选择。高音管笛通过稳定音区移调，避免直接过吹模型不稳定。

音色在后台线程预生成短窗口，主播放器使用原有音符事件与时钟。无法创建 Worker 时可退回本机生成；无法初始化 WASM 时仍保留现有合成音色。预生成与试听均不联网。
