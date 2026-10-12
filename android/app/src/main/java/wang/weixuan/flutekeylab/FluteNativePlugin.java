package wang.weixuan.flutekeylab;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Narrow Capacitor bridge; secrets stay in the original Android Keystore vault. */
@CapacitorPlugin(name = "FluteNative")
public final class FluteNativePlugin extends Plugin {
    @PluginMethod public void invoke(PluginCall call) {
        MainActivity activity = (MainActivity) getActivity();
        if (!activity.trustedPage()) { call.reject("当前页面不能访问系统功能"); return; }
        String action = call.getString("action", "");
        JSArray a = call.getArray("args", new JSArray());
        MainActivity.NativeTools tools = activity.tools;
        Object value = true;
        try {
            switch (action) {
                case "credentialList": value = activity.vault.metadata(); break;
                case "storeCredential": value = tools.storeCredential(a.getString(0), a.getString(1), a.getString(2), a.getString(3), a.getString(4)); break;
                case "deleteCredential": value = tools.deleteCredential(a.getString(0)); break;
                case "copyText": tools.copyText(a.getString(0)); break;
                case "readClipboard": value = tools.readClipboard(); break;
                case "uploadChunk": value = tools.uploadChunk(a.getString(0), a.getString(1)); break;
                case "releaseTransfer": tools.releaseTransfer(a.getString(0)); break;
                case "saveTransfer": tools.saveTransfer(a.getString(0), a.getString(1), a.optString(2, "application/octet-stream")); break;
                case "httpRequest": tools.httpRequest(a.getString(0), a.getString(1), a.getString(2), a.getString(3), a.optString(4, "")); break;
                case "httpFetch": tools.httpFetch(a.getString(0), a.getString(1), a.getString(2), a.getString(3), a.getString(4), a.optString(5, "")); break;
                case "printScoreTitled": tools.printScoreTitled(a.optString(0, "笛调之间")); break;
                case "printScore": tools.printScore(); break;
                case "setImmersive": tools.setImmersive(a.getBoolean(0)); break;
                case "openExternal": tools.openExternal(a.getString(0)); break;
                default: call.reject("不支持的系统操作"); return;
            }
            JSObject result = new JSObject();
            result.put("value", value);
            call.resolve(result);
        } catch (Exception error) { call.reject("系统操作失败：" + error.getMessage()); }
    }
}
// Modified by AI on 2026-10-12 15:20:38
