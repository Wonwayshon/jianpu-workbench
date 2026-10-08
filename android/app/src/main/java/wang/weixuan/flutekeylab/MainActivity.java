package wang.weixuan.flutekeylab;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.database.Cursor;
import android.provider.OpenableColumns;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.content.pm.PackageManager;
import android.Manifest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.net.Socket;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import android.util.Base64;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import org.json.JSONObject;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** A local-content WebView with narrow, user-driven Android integrations. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "appassets.androidplatform.net";
    private static final String START = "https://" + ORIGIN + "/assets/index.html";
    private static final int PICK_IMAGE = 1001;
    private static final int SAVE_TEXT = 1002;
    private static final int SAVE_TRANSFER = 1003;
    private static final int MIC_PERMISSION = 1004;
    private PermissionRequest pendingMic;
    private File transferDir;
    private File pendingTransfer;
    private WebView webView;
    private volatile boolean trustedDocument = false;
    private CredentialVault vault;
    private final java.util.concurrent.Semaphore networkSlots = new java.util.concurrent.Semaphore(4);
    private ValueCallback<Uri[]> pendingImage;
    private String pendingText;
    private String pendingFileKind = "image";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(241, 245, 250));
        getWindow().setNavigationBarColor(Color.rgb(241, 245, 250));
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(241, 245, 250));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        transferDir = new File(getCacheDir(), "transfer");
        if (!transferDir.isDirectory()) transferDir.mkdirs();
        File[] stale = transferDir.listFiles();
        if (stale != null) for (File f : stale) f.delete();
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        root.requestApplyInsets();
        WebSettings settings = webView.getSettings();
        vault = new CredentialVault(this);
        WebView.setWebContentsDebuggingEnabled(false);
        settings.setSafeBrowsingEnabled(true);
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Read only documents explicitly selected in the system picker.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        webView.setBackgroundColor(Color.rgb(241, 245, 250));
        webView.addJavascriptInterface(new NativeTools(), "AndroidTools");
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                trustedDocument = isAppPage(Uri.parse(url));
                if (!trustedDocument) view.stopLoading();
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"https".equals(uri.getScheme()) || !ORIGIN.equals(uri.getHost()) || (uri.getPort() != -1 && uri.getPort() != 443)) return localError("External resource blocked");
                String path = uri.getPath();
                if ("https".equals(uri.getScheme()) && path != null && path.matches("/transfer/[A-Za-z0-9_-]{1,80}\\.down")) {
                    try {
                        return new WebResourceResponse("application/octet-stream", null, new FileInputStream(new File(transferDir, path.substring(10))));
                    } catch (IOException error) { return localError("Not found"); }
                }
                if ("https".equals(uri.getScheme()) && path != null && path.startsWith("/assets/")
                        && !path.contains("..") && !path.contains("\\") && path.indexOf(0) < 0) {
                    String asset = path.substring("/assets/".length());
                    String mime = asset.endsWith(".html") ? "text/html" : asset.endsWith(".css") ? "text/css"
                            : asset.endsWith(".js") || asset.endsWith(".mjs") ? "application/javascript"
                            : asset.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
                    try {
                        return new WebResourceResponse(mime, mime.startsWith("text/") || mime.equals("application/javascript") ? "UTF-8" : null, getAssets().open(asset));
                    } catch (IOException error) { return localError("Not found"); }
                }
                return localError("Not found");
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return routeNavigation(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return routeNavigation(Uri.parse(url));
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            // Microphone (tuner) or camera (share-code scanner): only for our own page, one device at a time,
            // and only after the user allows the matching Android permission.
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    String[] res = request.getResources();
                    String perm = null;
                    if (res.length == 1 && PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res[0])) perm = Manifest.permission.RECORD_AUDIO;
                    if (res.length == 1 && PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res[0])) perm = Manifest.permission.CAMERA;
                    if (!trustedDocument || perm == null || !"https".equals(request.getOrigin().getScheme()) || !ORIGIN.equals(request.getOrigin().getHost()) || (request.getOrigin().getPort() != -1 && request.getOrigin().getPort() != 443)) { request.deny(); return; }
                    if (checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(res);
                    } else {
                        if (pendingMic != null) pendingMic.deny();
                        pendingMic = request;
                        requestPermissions(new String[]{perm}, MIC_PERMISSION);
                    }
                });
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                                       FileChooserParams parameters) {
                if (pendingImage != null) pendingImage.onReceiveValue(null);
                pendingImage = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                String accept = String.join(",", parameters.getAcceptTypes()).toLowerCase(Locale.ROOT);
                pendingFileKind = accept.contains("pdf") && accept.contains("image") ? "score" : accept.contains("pdf") ? "pdf"
                        : accept.contains("json") || accept.contains("zip") ? "json" : "image";
                if (pendingFileKind.equals("pdf")) {
                    intent.setType("application/pdf");
                } else if (pendingFileKind.equals("score")) {
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf", "image/png", "image/jpeg", "image/webp",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"});
                } else if (pendingFileKind.equals("json")) {
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/zip", "application/x-zip-compressed", "application/json", "text/plain", "application/octet-stream"});
                } else {
                    intent.setType("image/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/png", "image/jpeg", "image/webp"});
                }
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(intent, PICK_IMAGE); }
                catch (ActivityNotFoundException error) {
                    pendingImage.onReceiveValue(null);
                    pendingImage = null;
                    toast("找不到系统文件选择器。");
                }
                return true;
            }
        });
        webView.loadUrl(START);
    }

    private File transferFile(String id, String suffix) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{1,80}")) return null;
        return new File(transferDir, id + suffix);
    }

    /** Minimal HTTP/1.1 client over TLS: any method, fixed-length body, chunked or length-delimited response. */
    private static int rawHttps(String method, URL url, JSONObject headers, byte[] bytes, File bodyFile, File out,
                                JSONObject responseHeaders) throws Exception {
        if (!"https".equals(url.getProtocol())) throw new IOException("只支持 https 地址");
        String host = url.getHost();
        int port = url.getPort() < 0 ? 443 : url.getPort();
        try (SSLSocket socket = (SSLSocket) SSLSocketFactory.getDefault().createSocket(host, port)) {
            socket.setSoTimeout(120000);
            javax.net.ssl.SSLParameters params = socket.getSSLParameters();
            params.setEndpointIdentificationAlgorithm("HTTPS");
            socket.setSSLParameters(params);
            socket.startHandshake();
            if (!HttpsURLConnection.getDefaultHostnameVerifier().verify(host, socket.getSession()))
                throw new IOException("服务器证书与域名不匹配");
            String path = url.getPath() == null || url.getPath().isEmpty() ? "/" : url.getPath();
            if (url.getQuery() != null) path += "?" + url.getQuery();
            long length = bodyFile != null ? bodyFile.length() : bytes != null ? bytes.length : 0;
            StringBuilder head = new StringBuilder();
            head.append(method).append(' ').append(path).append(" HTTP/1.1\r\nHost: ").append(host);
            if (port != 443) head.append(':').append(port);
            head.append("\r\nConnection: close\r\nUser-Agent: FluteKeyLab\r\nAccept-Encoding: identity\r\n");
            for (Iterator<String> keys = headers.keys(); keys.hasNext(); ) {
                String key = keys.next(), value = headers.optString(key);
                if (key.matches("[A-Za-z0-9-]+") && !value.contains("\r") && !value.contains("\n"))
                    head.append(key).append(": ").append(value).append("\r\n");
            }
            if (bodyFile != null || bytes != null || "PUT".equals(method) || "POST".equals(method))
                head.append("Content-Length: ").append(length).append("\r\n");
            head.append("\r\n");
            OutputStream output = socket.getOutputStream();
            output.write(head.toString().getBytes(StandardCharsets.UTF_8));
            if (bytes != null) output.write(bytes);
            if (bodyFile != null) try (InputStream in = new FileInputStream(bodyFile)) {
                byte[] chunk = new byte[65536];
                for (int n; (n = in.read(chunk)) > 0; ) output.write(chunk, 0, n);
            }
            output.flush();
            BufferedInputStream input = new BufferedInputStream(socket.getInputStream(), 65536);
            String statusLine = readLine(input);
            if (statusLine == null || !statusLine.startsWith("HTTP/")) throw new IOException("服务器响应无效");
            int status = Integer.parseInt(statusLine.split(" ")[1]);
            long contentLength = -1;
            boolean chunked = false; int headerBytes = 0;
            for (String line; (line = readLine(input)) != null && !line.isEmpty(); ) {
                headerBytes += line.length(); if (headerBytes > 65536) throw new IOException("响应头过长");
                int colon = line.indexOf(':');
                if (colon <= 0) continue;
                String key = line.substring(0, colon).trim().toLowerCase(Locale.ROOT), value = line.substring(colon + 1).trim();
                responseHeaders.put(key, value);
                if (key.equals("content-length")) contentLength = Long.parseLong(value);
                if (key.equals("transfer-encoding") && value.toLowerCase(Locale.ROOT).contains("chunked")) chunked = true;
            }
            if (contentLength > 300L * 1024 * 1024) throw new IOException("下载超过 300 MB 限制");
            long received = 0, deadline = System.nanoTime() + 180000000000L;
            try (OutputStream file = new FileOutputStream(out)) {
                if ("HEAD".equals(method) || status == 204 || status == 304) return status;
                byte[] buffer = new byte[65536];
                if (chunked) {
                    for (String size; (size = readLine(input)) != null; ) {
                        int semi = size.indexOf(';');
                        long remaining = Long.parseLong((semi >= 0 ? size.substring(0, semi) : size).trim(), 16);
                        if (remaining == 0) break;
                        if (remaining < 0 || remaining > 300L * 1024 * 1024) throw new IOException("响应分块无效或过大");
                        while (remaining > 0) {
                            int n = input.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                            if (n < 0) throw new IOException("连接意外中断");
                            received += n; if (received > 300L * 1024 * 1024 || System.nanoTime() > deadline) throw new IOException("下载过大或超时");
                            file.write(buffer, 0, n);
                            remaining -= n;
                        }
                        readLine(input);
                    }
                } else {
                    long remaining = contentLength < 0 ? Long.MAX_VALUE : contentLength;
                    while (remaining > 0) {
                        int n = input.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                        if (n < 0) { if (contentLength >= 0 && remaining > 0) throw new IOException("连接意外中断"); break; }
                        received += n; if (received > 300L * 1024 * 1024 || System.nanoTime() > deadline) throw new IOException("下载过大或超时");
                            file.write(buffer, 0, n);
                        remaining -= n;
                    }
                }
            }
            return status;
        }
    }

    private static String readLine(InputStream input) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        for (int b; (b = input.read()) >= 0; ) {
            if (b == '\n') return line.toString("UTF-8").replaceAll("\r$", "");
            line.write(b);
            if (line.size() > 65536) throw new IOException("响应头过长");
        }
        return line.size() > 0 ? line.toString("UTF-8") : null;
    }

    private WebResourceResponse localError(String message) {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null,
                new ByteArrayInputStream(message.getBytes(StandardCharsets.UTF_8)));
    }

    private boolean isAppPage(Uri uri) {
        return "https".equals(uri.getScheme()) && ORIGIN.equals(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null && "/assets/index.html".equals(uri.getPath());
    }
    private JSONObject authorizedHeaders(String raw, String target) throws Exception {
        CredentialVault.endpoint(target);
        if (raw != null && raw.length() > 20000) throw new IOException("请求头过长");
        JSONObject headers = new JSONObject(raw == null ? "{}" : raw);
        String id = headers.optString("X-Flute-Credential", ""); headers.remove("X-Flute-Credential");
        if (!id.isEmpty()) headers.put("Authorization", vault.authorization(id, target));
        for (Iterator<String> it = headers.keys(); it.hasNext();) {
            String key = it.next(), value = headers.optString(key);
            if (key.matches("(?i)Host|Connection|Content-Length|Transfer-Encoding|Cookie") || !key.matches("[A-Za-z0-9-]{1,80}") || value.length() > 12000 || value.contains("\r") || value.contains("\n")) throw new IOException("请求头无效");
        }
        return headers;
    }
    private boolean routeNavigation(Uri uri) {
        if (isAppPage(uri)) return false;
        if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
            catch (ActivityNotFoundException error) { toast("找不到浏览器。"); }
        }
        return true;
    }

    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }

    public final class NativeTools {
        @JavascriptInterface public void openExternal(String url) {
            runOnUiThread(() -> { try { routeNavigation(Uri.parse(CredentialVault.endpoint(url).toString())); }
                catch (Exception error) { toast("链接无效。"); } });
        }

        @JavascriptInterface public boolean storeCredential(String id, String kind, String url, String user, String secret) {
            if (!trustedDocument) return false;
            try { return vault.save(id, kind, url, user, secret); } catch (Exception error) { return false; }
        }
        @JavascriptInterface public boolean hasCredential(String id) { return trustedDocument && vault.exists(id); }
        @JavascriptInterface public boolean deleteCredential(String id) {
            if (!trustedDocument) return false;
            try { return vault.remove(id); } catch (Exception error) { return false; }
        }
        @JavascriptInterface public void copyText(String text) {
            if (!trustedDocument) return;
            if (text == null || text.length() > 1000000) return;
            runOnUiThread(() -> {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newPlainText("笛调之间", text));
                toast("已复制");
            });
        }
        // Clipboard text for 「粘贴 AI 结果」: the WebView does not grant navigator.clipboard.readText. Read on the
        // UI thread (Android 10+ only allows it while the app has focus, which it has when the button is tapped).
        @JavascriptInterface public String readClipboard() {
            if (!trustedDocument) return "";
            java.util.concurrent.FutureTask<String> task = new java.util.concurrent.FutureTask<>(() -> {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (clipboard == null || !clipboard.hasPrimaryClip()) return "";
                ClipData clip = clipboard.getPrimaryClip();
                if (clip == null || clip.getItemCount() == 0) return "";
                CharSequence text = clip.getItemAt(0).coerceToText(MainActivity.this);
                return text == null ? "" : text.toString();
            });
            runOnUiThread(task);
            try { return task.get(2, java.util.concurrent.TimeUnit.SECONDS); } catch (Exception e) { return ""; }
        }
        @JavascriptInterface public void saveText(String text) {
            if (!trustedDocument) return;
            saveFile("长笛数字谱.txt", "text/plain", text);
        }
        @JavascriptInterface public void saveFile(String filename, String mime, String text) {
            if (!trustedDocument) return;
            if (text == null || text.length() > 20000000 || filename == null) return;
            if (!"text/plain".equals(mime) && !"application/json".equals(mime)) return;
            String safeName = filename.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
            if (safeName.length() > 150) safeName = safeName.substring(0, 150);
            final String name = safeName;
            runOnUiThread(() -> {
                if (pendingText != null) { toast("请先完成当前保存操作。"); return; }
                pendingText = text;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mime);
                intent.putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(intent, SAVE_TEXT); }
                catch (ActivityNotFoundException error) { pendingText = null; toast("找不到文件保存器。"); }
            });
        }
        /**
         * HTTPS request for the user-configured vision model API. Runs off the UI thread and reports back via
         * window.__nativeHttpDone(id, status, body); status 0 means the request itself failed.
         */
        @JavascriptInterface public void httpRequest(String id, String method, String url, String headersJson, String body) {
            if (!trustedDocument) return;
            if (id == null || !id.matches("[A-Za-z0-9_-]{1,100}") || url == null || (body != null && body.length() > 40000000)) return;
            if (!networkSlots.tryAcquire()) { runOnUiThread(() -> webView.evaluateJavascript("window.__nativeHttpDone(" + JSONObject.quote(id) + ",0,\"同时请求过多，请稍后重试\")", null)); return; }
            new Thread(() -> {
                int status = 0;
                String text;
                HttpURLConnection connection = null;
                try {
                    URL target = new URL(url);
                    if (!"https".equals(target.getProtocol())) throw new IOException("只支持 https 接口地址");
                    connection = (HttpURLConnection) target.openConnection();
                    connection.setInstanceFollowRedirects(false);
                    connection.setRequestMethod("GET".equals(method) ? "GET" : "POST");
                    connection.setConnectTimeout(20000);
                    connection.setReadTimeout(240000);
                    JSONObject headers = authorizedHeaders(headersJson, url);
                    for (Iterator<String> keys = headers.keys(); keys.hasNext(); ) {
                        String key = keys.next();
                        connection.setRequestProperty(key, headers.optString(key));
                    }
                    if (body != null && !"GET".equals(method)) {
                        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                        connection.setDoOutput(true);
                        connection.setFixedLengthStreamingMode(bytes.length);
                        try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
                    }
                    status = connection.getResponseCode();
                    InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                    if (input != null) {
                        try (InputStream stream = input) {
                            byte[] chunk = new byte[16384];
                            for (int n; (n = stream.read(chunk)) > 0; ) {
                                buffer.write(chunk, 0, n);
                                if (buffer.size() > 8000000) throw new IOException("响应超过 8 MB 限制");
                            }
                        }
                    }
                    text = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
                } catch (Exception error) {
                    status = 0;
                    text = error.getClass().getSimpleName() + ": " + error.getMessage();
                } finally {
                    if (connection != null) connection.disconnect();
                    networkSlots.release();
                }
                final String script = ("window.__nativeHttpDone(" + JSONObject.quote(id) + "," + status + ","
                        + JSONObject.quote(text) + ")").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
                runOnUiThread(() -> { if (webView != null && trustedDocument) webView.evaluateJavascript(script, null); });
            }, "model-request").start();
        }
        /** Appends a base64 chunk to the upload buffer for transfer {@code id}. */
        @JavascriptInterface public boolean uploadChunk(String id, String base64) {
            if (!trustedDocument) return false;
            File file = transferFile(id, ".up");
            if (file == null || base64 == null || base64.length() > 1500000) return false;
            long total = 0; File[] buffers = transferDir.listFiles(); if (buffers != null) for (File entry : buffers) total += entry.length();
            if (total + base64.length() > 600L * 1024 * 1024 || file.length() + base64.length() > 300L * 1024 * 1024) return false;
            try (FileOutputStream out = new FileOutputStream(file, true)) {
                out.write(Base64.decode(base64, Base64.DEFAULT));
                return file.length() <= 300L * 1024 * 1024;
            } catch (IOException | IllegalArgumentException error) { return false; }
        }
        @JavascriptInterface public void releaseTransfer(String id) {
            if (!trustedDocument) return;
            File up = transferFile(id, ".up"), down = transferFile(id, ".down");
            if (up != null) up.delete();
            if (down != null) down.delete();
        }
        /**
         * HTTPS request with any method (WebDAV needs MKCOL / PROPFIND). Body: none, the given UTF-8 text, or the
         * uploaded transfer buffer. The response body is written to /transfer/{id}.down for the page to fetch;
         * completion calls window.__nativeFetchDone(id, status, headersJson, error).
         */
        @JavascriptInterface public void httpFetch(String id, String method, String url, String headersJson, String bodyMode, String text) {
            if (!trustedDocument) return;
            final File up = transferFile(id, ".up"), down = transferFile(id, ".down");
            if (up == null || method == null || !method.matches("GET|HEAD|PUT|POST|DELETE|MKCOL|PROPFIND") || url == null || (text != null && text.length() > 20000000)) return;
            if (!networkSlots.tryAcquire()) { runOnUiThread(() -> webView.evaluateJavascript("window.__nativeFetchDone(" + JSONObject.quote(id) + ",0,\"{}\",\"同时请求过多，请稍后重试\")", null)); return; }
            new Thread(() -> {
                int status = 0;
                JSONObject responseHeaders = new JSONObject();
                String error = "";
                try {
                    byte[] bytes = "text".equals(bodyMode) && text != null ? text.getBytes(StandardCharsets.UTF_8) : null;
                    File bodyFile = "upload".equals(bodyMode) ? up : null;
                    status = rawHttps(method, new URL(url), authorizedHeaders(headersJson, url), bytes, bodyFile, down, responseHeaders);
                } catch (Exception failure) {
                    error = failure.getClass().getSimpleName() + ": " + failure.getMessage();
                } finally { up.delete(); networkSlots.release(); if (status == 0) down.delete(); }
                final String script = "window.__nativeFetchDone(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(responseHeaders.toString()) + "," + JSONObject.quote(error) + ")";
                runOnUiThread(() -> { if (webView != null && trustedDocument) webView.evaluateJavascript(script, null); });
            }, "transfer").start();
        }
        /** Lets the user save the uploaded transfer buffer (a backup zip, an original score file) with the system picker. */
        @JavascriptInterface public void saveTransfer(String id, String filename, String mime) {
            if (!trustedDocument) return;
            final File up = transferFile(id, ".up");
            if (up == null || !up.isFile() || filename == null) return;
            String safeName = filename.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
            if (safeName.length() > 150) safeName = safeName.substring(0, 150);
            final String name = safeName, type = mime == null || !mime.matches("[a-z]+/[a-z0-9.+-]+") ? "application/octet-stream" : mime;
            runOnUiThread(() -> {
                if (pendingTransfer != null) { toast("请先完成当前保存操作。"); return; }
                File keep = new File(transferDir, "save-" + System.currentTimeMillis() + ".bin");
                if (!up.renameTo(keep)) { toast("文件准备失败，请重试。"); return; }
                pendingTransfer = keep;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(type);
                intent.putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(intent, SAVE_TRANSFER); }
                catch (ActivityNotFoundException error) { keep.delete(); pendingTransfer = null; toast("找不到文件保存器。"); }
            });
        }
        /** Performance mode: hide the system bars (swipe from an edge shows them briefly) and keep the screen on. */
        @JavascriptInterface public void setImmersive(boolean on) {
            if (!trustedDocument) return;
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if (Build.VERSION.SDK_INT >= 30) {
                    WindowInsetsController controller = getWindow().getInsetsController();
                    if (controller == null) return;
                    int bars = WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars();
                    if (on) {
                        controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                        controller.hide(bars);
                    } else controller.show(bars);
                } else {
                    getWindow().getDecorView().setSystemUiVisibility(on
                            ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                }
            });
        }
        @JavascriptInterface public void printScore() {
            if (!trustedDocument) return;
            runOnUiThread(() -> {
                PrintManager manager = (PrintManager) getSystemService(PRINT_SERVICE);
                if (manager == null) { toast("当前设备不支持打印。"); return; }
                manager.print("长笛数字谱", webView.createPrintDocumentAdapter("长笛数字谱"),
                        new PrintAttributes.Builder().build());
            });
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_IMAGE && pendingImage != null) {
            Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
            boolean valid = false;
            if (uri != null && "content".equals(uri.getScheme())) {
                try {
                    String mime = getContentResolver().getType(uri);
                    String name = "";
                    try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                        if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0).toLowerCase(Locale.ROOT);
                    }
                    boolean image = "image/png".equals(mime) || "image/jpeg".equals(mime) || "image/webp".equals(mime);
                    boolean pdf = "application/pdf".equals(mime) || name.endsWith(".pdf");
                    if (pendingFileKind.equals("pdf")) {
                        valid = pdf;
                    } else if (pendingFileKind.equals("score")) {
                        boolean word = name.endsWith(".docx") || name.endsWith(".doc") || (mime != null && (mime.contains("wordprocessingml") || mime.equals("application/msword")));
                        valid = pdf || image || word;
                    } else if (pendingFileKind.equals("json")) {
                        valid = "application/json".equals(mime) || name.endsWith(".json") || name.endsWith(".zip")
                                || (mime != null && mime.contains("zip"));
                    } else {
                        valid = "image/png".equals(mime) || "image/jpeg".equals(mime) || "image/webp".equals(mime);
                    }
                } catch (RuntimeException ignored) { valid = false; }
            }
            pendingImage.onReceiveValue(valid ? new Uri[]{uri} : null);
            pendingImage = null;
            if (uri != null && !valid) toast("所选文件类型不正确，请按当前功能选择图片、PDF 或备份文件。");
        }
        if (request == SAVE_TRANSFER) {
            final File source = pendingTransfer;
            pendingTransfer = null;
            if (source == null) return;
            if (result != RESULT_OK || data == null || data.getData() == null) { source.delete(); return; }
            final Uri target = data.getData();
            new Thread(() -> {
                try (InputStream in = new FileInputStream(source); OutputStream stream = getContentResolver().openOutputStream(target, "wt")) {
                    if (stream == null) throw new IOException("No output stream");
                    byte[] chunk = new byte[65536];
                    for (int n; (n = in.read(chunk)) > 0; ) stream.write(chunk, 0, n);
                    runOnUiThread(() -> toast("文件已保存"));
                } catch (IOException | SecurityException error) {
                    runOnUiThread(() -> toast("保存失败，请换一个文件夹重试。"));
                } finally { source.delete(); }
            }, "save-transfer").start();
        }
        if (request == SAVE_TEXT) {
            final String text = pendingText;
            pendingText = null;
            if (result != RESULT_OK || data == null || data.getData() == null || text == null) return;
            final Uri target = data.getData();
            new Thread(() -> {
                try (OutputStream stream = getContentResolver().openOutputStream(target, "wt")) {
                    if (stream == null) throw new IOException("No output stream");
                    stream.write(text.getBytes(StandardCharsets.UTF_8));
                    runOnUiThread(() -> toast("文件已保存"));
                } catch (IOException | SecurityException error) {
                    runOnUiThread(() -> toast("保存失败，请换一个文件夹重试。"));
                }
            }, "save-score").start();
        }
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request != MIC_PERMISSION || pendingMic == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) pendingMic.grant(pendingMic.getResources());
        else {
            boolean camera = PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(pendingMic.getResources()[0]);
            pendingMic.deny();
            toast(camera ? "没有相机权限，无法扫码。可改用「从图片识别」，或在系统设置中开启。" : "没有麦克风权限，调音器无法工作。可在系统设置中开启。");
        }
        pendingMic = null;
    }

    @Override public void onBackPressed() {
        webView.evaluateJavascript("(function(){if(window.handleAppBack&&window.handleAppBack())return true;if(typeof showTab==='function' && document.getElementById('instrumentPanel').hidden){showTab('instrument');return true;}if(window.pdfWorkbenchCanLeave && !window.pdfWorkbenchCanLeave())return true;return false;})()",
                handled -> { if (!"true".equals(handled)) finish(); });
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        webView.saveState(state);
        super.onSaveInstanceState(state);
    }
    @Override protected void onDestroy() {
        if (pendingImage != null) pendingImage.onReceiveValue(null);
        webView.removeJavascriptInterface("AndroidTools");
        webView.destroy();
        super.onDestroy();
    }
}
// Modified by AI on 2026-10-08 14:35:52
