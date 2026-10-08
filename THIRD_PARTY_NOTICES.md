# 第三方资料与许可证

本项目自有代码采用 GPL-3.0-only。以下依赖保留其原有版权声明和许可证；项目许可证不替代这些文件。

| 依赖 | 许可证位置 |
| --- | --- |
| abcjs | `web/vendor/abcjs/LICENSE.md`（MIT） |
| PDF.js | `web/vendor/pdfjs/LICENSE`（Apache-2.0） |
| PDF.js 字符映射、字体与 WASM 组件 | `web/vendor/pdfjs/cmaps/LICENSE`、`standard_fonts/LICENSE_*`、`wasm/LICENSE_*` |
| jsQR | `web/vendor/jsQR.LICENSE`（Apache-2.0） |
| qrcode-generator | `web/vendor/qrcode-generator.js` 中的 MIT 声明 |

Node 与 Rust 依赖由 `package-lock.json` 和 `desktop/src-tauri/Cargo.lock` 锁定，各自许可证以相应上游包为准。

完整第三方曲谱不随公开源码分发，测试使用程序生成的序列与短小技术案例。指法参考资料仍可能涉及独立的第三方权利；GPL 不自动授予第三方资料的使用、改编或公开传播许可。
