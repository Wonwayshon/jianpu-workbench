# 轻量桌面外壳

在项目根目录执行 `npm run dev:desktop` / `npm run build:desktop`。首次安装依赖 `npm ci`，并准备 Rust stable 与系统编译工具；构建从相同的 web/platform 源码生成资源。

平台：Mac arm64 / x64 和 Windows x64 可使用相应机器构建。当前工作区为 Mac arm64；没有把 JVM、CEF 或 Rust 编译器放入安装包。

- 核心乐谱与 IndexedDB 共用网页实现，数据目录由 Tauri 固定应用标识管理。
- Mac 钥匙串 / Windows 凭据管理器保存识别 Key 与 WebDAV 密码，页面只得到元数据和凭据 ID。
- 使用 Rust HTTPS 请求，校验证书、禁用重定向、限定凭据地址 / 目录、限制响应与并发。
- 文件只通过用户选择的保存对话框写入；外链交给系统浏览器，主窗口禁止加载外站。
- Windows 安装时按需补装 WebView2；没有内置完整离线 WebView2 安装器。
- Mac 麦克风与摄像头用途写在 Info.plist；实际设备授权仍需测试。

`src-tauri/tauri.conf.json`、`src-tauri/gen`、`src-tauri/target` 均为生成内容；配置改 `tauri.template.json`。依赖锁定在 npm 与 Cargo 锁文件。应用图标复用 Android 的矢量图，重新生成可执行 `scripts/icons.py`（Pillow）。

本地 Mac 构建为未公证测试版；面向朋友正式分发需独立桌面签名与 Mac 公证。Android 签名证书不用于桌面发布。

## 1.20.1 Mac 打包修正

Mac 构建默认使用完整 App 的 ad-hoc 签名，构建结束运行 `codesign --verify --deep --strict`；失败则构建命令报错。此前 1.20.0 只有 Mach-O 链接器签名，应用资源未签封，可能出现“已损坏”。

执行 `npm run build:desktop -- --bundles app` 后，再执行 `npm run package:mac` 生成 DMG。打包检查版本、应用标识、应用签名及 DMG 校验和。CI 交付 DMG，使文件可执行权限保留在镜像里。

ad-hoc 签名不是 Developer ID 或 Apple 公证；首次打开仍可能需在系统设置的“隐私与安全性”中点“仍要打开”。正式公开分发可配置 Developer ID 并完成 Apple 公证；无需关闭系统 Gatekeeper。
