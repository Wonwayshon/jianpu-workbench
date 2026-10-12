# Android 手机壳

手机壳使用 Capacitor 8.5.3，公共页面在 `web/`，系统适配在 `platform/android.js`。安装根目录 npm 依赖后，Android Studio 打开本目录；需要 JDK 21（HotSpot）、Android SDK 36。`./gradlew :app:assembleDebug` 会自动同步公共网页。正式 APK 使用 release 构建及既有证书签名。

`FluteNativePlugin` 提供异步、限定操作的插件接口；现有凭据保险库、HTTPS 文件传输、打印、文件选择及沉浸模式继续由原生代码实现。网页不会收到已保存的密钥明文。

原地升级保留包名、签名、默认 WebView 数据目录、`https://appassets.androidplatform.net` 来源与 `flute-key-lab-scores` 数据库。网址中的页面路径可以变化，来源保持一致；不清空旧存档或设置。凭据仍使用原 Keystore 别名及 SharedPreferences 文件。

可编辑源码只在 `web/`；生成页面在 `dist/android/assets`，Capacitor 打包资源在 `dist/android/capacitor-assets`。`npm run export:android` 导出包含 Capacitor 源码和网页的独立工程，不含签名私钥。

覆盖升级验证说明见 `docs/android-capacitor-upgrade.md`。测试用检查插件是单独的 APK，正式 App 保持关闭 WebView 调试。
