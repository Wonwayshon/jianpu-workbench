package wang.weixuan.flutekeylab;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.net.URI;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Encrypted credentials. No bridge API exposes decrypted values to JavaScript. */
final class CredentialVault {
    private final SharedPreferences prefs;
    private static final String ALIAS = "flute.credentials.v1";
    static final String KEEP = "__FLUTE_STORED_CREDENTIAL__";
    CredentialVault(Context context) { prefs = context.getSharedPreferences("credential-vault", Context.MODE_PRIVATE); }
    private static void validId(String id) { if (id == null || !id.matches("(?:ocr-[A-Za-z0-9_-]{1,80}|webdav)")) throw new IllegalArgumentException("凭据标识无效"); }
    static URI endpoint(String value) throws Exception {
        URI u = new URI(value);
        if (!"https".equalsIgnoreCase(u.getScheme()) || u.getHost() == null || u.getUserInfo() != null || u.getFragment() != null || (u.getPort() != -1 && (u.getPort() < 1 || u.getPort() > 65535))) throw new IllegalArgumentException("需要不含账号和片段的 HTTPS 地址");
        if (value.length() > 2048 || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) throw new IllegalArgumentException("地址无效");
        return u.normalize();
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    private JSONObject read(String id) throws Exception {
        validId(id); String stored = prefs.getString(id, null); if (stored == null) return null;
        JSONObject box = new JSONObject(stored); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(box.getString("iv"), Base64.NO_WRAP)));
        cipher.updateAAD(id.getBytes(StandardCharsets.UTF_8));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(box.getString("data"), Base64.NO_WRAP)), StandardCharsets.UTF_8));
    }
    synchronized boolean save(String id, String kind, String url, String user, String secret) throws Exception {
        validId(id); if (!("bearer".equals(kind) || "basic".equals(kind))) return false;
        if (secret == null || secret.length() > 8192 || user == null || user.length() > 512) return false;
        String normalized = endpoint(url).toString();
        if (KEEP.equals(secret)) { JSONObject old = read(id); return old != null && normalized.equals(old.getString("url")) && kind.equals(old.getString("kind")) && user.equals(old.getString("user")); }
        if (secret.isEmpty()) return prefs.edit().remove(id).commit();
        JSONObject value = new JSONObject().put("url", normalized).put("kind", kind).put("user", user).put("secret", secret);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key()); cipher.updateAAD(id.getBytes(StandardCharsets.UTF_8));
        JSONObject box = new JSONObject().put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).put("data", Base64.encodeToString(cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
        return prefs.edit().putString(id, box.toString()).commit();
    }
    synchronized boolean exists(String id) { try { return read(id) != null; } catch (Exception e) { return false; } }
    synchronized boolean remove(String id) { validId(id); return prefs.edit().remove(id).commit(); }
    synchronized String authorization(String id, String target) throws Exception {
        JSONObject value = read(id); if (value == null) throw new IllegalArgumentException("凭据不可用，请重新填写并保存");
        URI allowed = endpoint(value.getString("url")), actual = endpoint(target);
        if (!allows(allowed, actual, value.getString("kind"))) throw new IllegalArgumentException("请求地址与保存凭据的服务不匹配，请重新填写密码");
        if ("bearer".equals(value.getString("kind"))) return "Bearer " + value.getString("secret");
        return "Basic " + Base64.encodeToString((value.getString("user") + ":" + value.getString("secret")).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
    }
    static boolean allows(URI allowed, URI actual, String kind) {
        boolean sameOrigin = allowed.getHost().equalsIgnoreCase(actual.getHost()) && (allowed.getPort() < 0 ? 443 : allowed.getPort()) == (actual.getPort() < 0 ? 443 : actual.getPort());
        String basePath = allowed.getPath().isEmpty() ? "/" : allowed.getPath();
        boolean pathOK = "bearer".equals(kind) ? allowed.equals(actual) : (actual.getPath().equals(basePath) || actual.getPath().startsWith(basePath.endsWith("/") ? basePath : basePath + "/"));
        return sameOrigin && pathOK && !actual.getRawPath().matches("(?i).*%(?:2e|2f|5c).*" );
    }

}
// Modified by AI on 2026-10-08 10:06:28
