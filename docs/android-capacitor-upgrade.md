# Android Capacitor 原地升级验证

手机壳使用 Capacitor 8.5.3，保持原包名、发布证书、HTTPS 来源及 WebView 默认数据目录。IndexedDB `flute-key-lab-scores`、设置键、Keystore 别名 `flute.credentials.v1` 和 SharedPreferences `credential-vault` 均保持原样。`/assets/index.html` 改为 `/index.html` 不改变来源。

## 已验证范围

使用专用 Android 模拟器，安装原样的正式 1.22.10 APK，通过同证书的独立测试 APK开启检查。写入存档、附件、手改指法、有效改善记录、历史版本、练习设置和模型凭据，然后直接覆盖安装 Capacitor 的 1.23.0 正式签名 APK。未导出或导入备份。

逐项比较原存档及附件内容、历史记录和设置；检查原加密凭据仍能读取元数据并复用。新版原生插件、剪贴板、真实 HTTPS 下载、再次保存与退出重启均通过。最低 Android 版本仍是 8（API 26）；这次覆盖安装实测使用现有 API 37.2 模拟器，旧型号真机及所有厂商 WebView仍需设备覆盖测试。

测试插件不进入正式应用；正式包关闭 WebView 调试。普通源码包内只有测试源码，不含检查 APK、存档快照或签名材料。

## 复现

需要 Node 22+、JDK 21（HotSpot）、Android SDK 36 和专用模拟器。测试会写入固定名称的验证存档与设置，请勿在日常使用的设备上运行。验证 APK必须与被测正式 APK使用同一证书。

1. 设置 `ANDROID_HOME`、`JAVA_HOME`、`ANDROID_TEST_KEYSTORE`，以及 `ANDROID_TEST_PASSWORD_FILE` 或 `ANDROID_STORE_PASSWORD`；签名材料不要提交到仓库。
2. 执行 `node tests/android-upgrade/build-probe.mjs`，输出到忽略目录 `work/android-upgrade-probe/probe.apk`。
3. 在专用模拟器安装旧正式 APK，再执行 `adb install -r -t work/android-upgrade-probe/probe.apk`。
4. 执行 `node tests/android-upgrade/probe.mjs seed`，生成包含附件 SHA256 的基线快照。
5. 执行 `adb install -r 新版.apk`，然后执行 `node tests/android-upgrade/probe.mjs verify`。
6. 再执行一次 `verify`，验证结束重启后数据仍与基线一致。

`ANDROID_TEST_SERIAL` 可指定模拟器，默认 `emulator-5554`；脚本拒绝真机序列号。`snapshot` 可对已有验证存档重新建立基线。检查完成会停止被测应用，下一次正常启动仍关闭调试；结束后可卸载 `wang.weixuan.flutekeylab.upgradeprobe`。

## 后续变更约束

保持网页来源、默认数据目录、数据库名称和密钥身份。修改这些内容前必须先设计带完整性验证、可重试且保留旧数据的迁移。自动测试会检查关键配置，并验证异步插件凭据处理、文件分块顺序、错误收尾与公共网页资源一致性。
