# Android 外壳

本目录是项目的 Android 源码，公共页面在上一级 `web/`，平台接口在 `platform/`。在项目根目录执行 `npm run build:android`；Android Studio 打开本目录，`preBuild` 会调用根目录脚本同步网页。

版本信息读取根目录 `project.json`，保持原包名和发布证书，可覆盖更新。`app/src/main/assets` 不存放第二份源码，生成资源在 `dist/android/assets`。

如需独立 Android Studio 工程，执行根目录 `npm run export:android`，使用生成的 `outputs/android-source`。请勿回改导出的 assets；公共功能统一改 `web/`。

签名材料只在当前机器私有 `work/android-signing` 中，源码导出和桌面包不会包含。其他机器请自行配置签名和 Android 构建工具。
