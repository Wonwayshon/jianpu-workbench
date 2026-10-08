# 笛调之间 · Jianpu Workbench

面向简谱的识别、转调、排版与练习工具，支持分谱与总谱、独立声部播放、PDF 导入、谱库管理，以及竹笛、篠笛、长笛和二胡的换算与指法辅助。

一个网页核心，浏览器、Android 和 macOS / Windows 外壳共用。版本与 Android 版本码以 `project.json` 为准。

## 日常修改位置

| 目录 | 用途 |
|---|---|
| `web/` | 页面、换算、指法、乐谱排版、PDF、播放、谱库；只在这里改公共功能 |
| `platform/` | 浏览器 / Android / Tauri 系统适配；公共代码通过 `Platform` 调用 |
| `android/` | 原 Android 外壳、Keystore、文件选择器与资源；保留原包名和签名 |
| `desktop/` | Tauri 桌面外壳、系统凭据、文件保存、网络、打印和全屏 |
| `scripts/` | 构建、预览、测试与源码导出 |
| `tests/` | 共用回归测试与程序生成的测试序列 |
| `dist/` | 构建生成的资源，不手动编辑 |
| `outputs/` | 安装包、独立网页和源码交付，不作为日常源码 |
| `work/` | 当前机器的工具链、旧测试和签名材料，不纳入版本库或交付源码 |

## 常用命令

需 Node.js 18+；推荐 Node.js 22 LTS。首次执行 `npm ci`，以后按需使用：

```sh
npm run dev                 # http://127.0.0.1:4173；本机网页预览
npm run check               # 平台边界、JS 语法、三端资源构建
npm test                    # 乐谱、二胡、PDF、谱库、凭据和平台接口测试
npm run build:web           # dist/web，完整静态网页资源
npm run build:android       # 当前 macOS 工作区签名 APK，可覆盖安装
npm run export:android      # outputs/android-source，独立 Android Studio 工程
npm run dev:desktop         # Tauri 开发窗口
npm run check:desktop       # Rust 编译及原生地址约束测试
npm run build:desktop       # 当前系统的桌面安装包，Mac 校验完整应用签名
npm run package:mac         # 将已构建的 Mac App 打包并验证 DMG
npm run build:checker       # 从 web 核心生成供 AI 自检的检查器
npm run release:source      # 不含签名和开发工具链的整个项目源码 ZIP
```

Android Studio 可以打开 `android/`；预构建自动调用 Node 同步最新网页资源。其他机器的 Android 构建需 JDK 17、SDK 35、Gradle 8.9，以及自己的发布签名；`build:android` 使用当前工作区私有工具与原签名，不是跨机器通用的签名服务。

桌面开发需 Rust stable 与系统构建工具；Windows 需要 MSVC / Windows SDK，Mac 需要 Xcode Command Line Tools。当前机器的 Rust 已放入 `work/rust/`，脚本自动识别，不修改系统 PATH。桌面外壳使用系统 WebView，无需随包携带 JVM 或 Chromium。Mac 包在 Mac 构建，Windows 包在 Windows 构建；工作流示例位于 `.github/workflows/check.yml`。

`project.json` 是版本发布入口。修改 `version` 和递增 `androidVersionCode` 后构建即可；网页缓存版本、APK、桌面配置与检查器自动同步。`desktop/src-tauri/tauri.conf.json` 是生成文件，桌面配置改 `desktop/tauri.template.json`。Cargo 包版本由构建同步。

## 迁移与存档

Android 包名、网页本地 HTTPS 地址、IndexedDB 名称和存档格式保持原有约定，覆盖更新沿用原发布证书。网页与桌面使用各自浏览器数据空间，初次迁移通过 JSON / ZIP 导入或 WebDAV，同一台机器也不会自动读取 Android 数据。

浏览器与 Android、桌面共享网页源码；浏览器凭据仅保留本次会话，Android 使用 Keystore，Mac / Windows 使用系统凭据存储。桌面外壳的凭据与网络通过原生接口处理，已保存密码不返回页面。

本机 `npm run dev` 绑定回环地址。对外提供网页版需发布 `dist/web` 到 HTTPS 静态站点；纯网页的识别接口和 WebDAV 仍受服务端 CORS 限制。当前工程不含 PWA Service Worker / 离线安装配置。

## 验证范围

已有核心测试和平台接口测试通过；Android 构建与覆盖签名检查通过。桌面原生地址校验与 Rust 编译通过。桌面 PDF、实际麦克风 / 摄像头权限、打印、系统凭据弹窗与用户交互仍需设备验证；Windows 安装包需要 Windows 构建环境验证。具体交付状态见 `docs/迁移记录.md`。

旧 Android 仓库历史仍保留在 `outputs/android-source/.git`，备份在 `work/pre-refactor-android.git`；导出不会覆盖 Git 元数据，交付 ZIP 不包含仓库元数据。

## 许可证

项目自有代码采用 **GPL-3.0-only**，完整条款见 [LICENSE](LICENSE)。第三方库与字体保留各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。公开仓库不包含用户提供的完整曲谱；测试使用程序生成的序列和短小技术案例。指法参考资料的第三方权利仍单独适用。

## 发布前隐私检查

`npm ci` 自动安装本仓库的 Git 提交检查钩子；已有其他钩子配置会保留，可执行 `npm run security:install` 手动安装。`npm run security:check` 检查当前跟踪文件，`npm run security:history` 检查所有本地分支、标签和远程引用的历史。检查只报告文件名与类别，不打印命中的凭据。匹配常见密钥格式不能替代人工核对任意密码、截图和用户数据。

桌面构建自动将编译路径映射到 `project`、`cargo`、`rustup` 等通用目录；Mac 打包前会拒绝仍含个人目录或已知密钥格式的可执行文件。源码导出排除 `.env`、私钥和密码文件，旧曲谱案例与历史备份仅保留在不提交的本地 `work/`。

## 应用更新

App 页脚提供“检查更新”，读取本项目的 GitHub 最新正式 Release，显示更新说明并打开对应平台的安装包。仅在仓库公开后可供未登录用户查询；请求不携带开发者的 GitHub 凭据。当前使用手动下载安装，没有后台自动替换程序。暂无对应架构安装包时打开官方发布页。
