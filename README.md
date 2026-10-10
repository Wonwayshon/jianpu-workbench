# 笛调之间 · Jianpu Workbench

把图片和 PDF 里的乐谱转成可编辑、可试听的简谱，帮助民乐与管乐爱好者读谱、转调和练习。

支持浏览器、Android、macOS 和 Windows，共用同一套乐谱处理核心。

## 下载与使用

在 [GitHub Releases](https://github.com/Wonwayshon/jianpu-workbench/releases/latest) 下载适合设备的安装包。

- **Android**：Android 8.0 及以上，下载安装 APK。
- **macOS**：macOS 13 及以上，Apple Silicon 设备使用 arm64 DMG。打开后把 App 拖到“应用程序”。当前包尚未经过 Apple Developer ID 签名和公证，首次打开可能需要在系统“隐私与安全性”中确认来源。
- **Windows**：使用 Release 提供的 Windows 安装程序；需要系统 WebView2 运行时。
- **浏览器**：可自行部署静态网页，也可按下面的方法在本机运行。

在“设置 → 应用更新”检查新版，也可直接打开发布页下载安装。覆盖更新前，建议在谱库导出备份。

## 能做什么

- **识谱与校对**：导入图片、图片 PDF 或文字 PDF，选择页码预览；通过视觉模型提取简谱或五线谱，也可以复制提示词到其他 AI 应用，再粘贴结果。
- **分谱与总谱**：分声部排版、筛选乐器、独立静音和音色设置。扬琴等乐器的上下谱表支持独立声部归组，无音的辅助声部自动收拢。
- **转调与播放**：查看原谱、固定调音名谱和五线谱；保持音高改写数字，或把整曲移到新调。支持节奏、和弦、倚音、反复、装饰音和敲击符号。
- **演奏与练习**：全屏单双页、连续排版、可选小节号（自定间隔）、节拍器、调音器，以及二胡指法和弓法辅助。
- **谱库管理**：保存校对结果、更新原存档、时间筛选、回收站、备份恢复、二维码传输和 WebDAV 同步。
- **音色试听**：在设置或播放设置对比现有音色和 Faust 管笛、弓弦、敲弦、钢琴、古筝、单簧管、双簧管候选，用相同练习片段试听后选择默认音色；总谱可为各声部单独选择。
- **乐器工具**：竹笛、篠笛的调性换算与孔位选择，长笛指法参考，二胡各调空弦速查。

## 开始转谱

1. 在“转谱”粘贴乐谱文本，或导入谱面图片。多页 PDF 可先到“谱库”选择需要识别的页码。
2. 选择分谱 / 总谱，以及简谱 / 五线谱。使用 API 时，在模型配置里选择 **DeepSeek** 并填写自己的 Key；其他服务选择“其他”并填写兼容接口与图片模型。
3. 对照原谱核对音高、节奏、反复和声部。识别和二胡指法建议可能有误，请以原谱及实际演奏为准。
4. 试听、转调、导出 PDF，或保存到谱库。从存档加载的谱子，保存会更新原存档，也可另存副本。

DeepSeek 预设使用官方 `https://api.deepseek.com` 接口和支持图片的 `deepseek-flash` 模型，参见 [官方图像理解文档](https://api-docs.deepseek.com/zh-cn/guides/vision/)。识别图片会发送给所选服务商，费用由服务商收取。

一个简单的乐谱文本：

```text
@title 练习
@key 1=D
@time 4/4
@tempo 80
1 2 3 4 | 5/6/ 5 - 0 |
```

完整语法和提取提示词可在转谱工作台查看。节奏不同的声部应分别转写；同时起止的双音或和弦使用 `<1 3>`。例如 `扬琴上谱表声部一`、`扬琴上谱表声部二` 会归到同一谱表。

## 数据与备份

谱库保存在当前设备或浏览器的数据空间中，卸载、清除数据或更换浏览器不会自动迁移。请使用谱库备份或 WebDAV 同步保留资料。

Android 使用系统密钥加密保存 API Key，桌面使用系统凭据存储；网页版 Key 仅在当前会话保留。图片识别、WebDAV 同步和检查更新需要网络；浏览器直接调用外部服务还受服务商的 CORS 配置限制。

## 本地运行与开发

需要 Node.js 18+（推荐 22 LTS）：

```sh
npm ci
npm run dev                 # 本机预览 http://127.0.0.1:4173
npm test                    # 核心与平台回归测试
npm run build:web           # 静态网页资源 dist/web
npm run build:faust         # 编辑 DSP 后重新编译轻量音色（普通构建无需运行）
npm run build:audition      # 导出独立离线音色试听 HTML
npm run dev:desktop         # Tauri 桌面开发
npm run build:desktop       # 当前平台的桌面构建
npm run export:android      # 导出 Android Studio 工程
npm run build:checker       # 供 AI 自检的简谱检查器
```

将 `dist/web` 部署到 HTTPS 静态站点即可使用网页版。Android 构建需要 JDK 17、Android SDK 35、Gradle 8.9 和自己的签名；桌面构建需要 Rust stable，以及 macOS 的 Xcode Command Line Tools 或 Windows 的 MSVC / Windows SDK。桌面使用系统 WebView。

| 目录 | 内容 |
|---|---|
| `web/` | 公共界面和乐谱处理 |
| `platform/` | 浏览器、Android、桌面适配 |
| `android/`、`desktop/` | 原生应用外壳 |
| `scripts/`、`tests/` | 构建与回归测试 |

版本统一在 `project.json` 管理。欢迎通过 Issues 反馈问题；复现时请提供应用版本、平台和最小乐谱示例。

## 许可证

自有代码使用 [GPL-3.0-only](LICENSE)。第三方库、字体和参考资料的权利见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。用户导入的乐谱不随软件许可证重新授权。
