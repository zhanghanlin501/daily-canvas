package com.dailycanvas.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * 应用内更新插件。
 *
 * 负责三件事：
 * 1. 读取当前安装包的版本信息（versionName / versionCode）
 * 2. 下载远程 APK 并上报下载进度
 * 3. 调起系统安装器完成覆盖安装（含 Android 8.0+ 的安装未知应用授权引导）
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String PREFS_NAME = "daily_canvas_updater";
    private static final String PREF_PENDING_PATH = "pending_apk_path";
    private static final String PREF_PENDING_VERSION = "pending_apk_version";
    private static final String PREF_INSTALL_STATE = "install_state";
    private static final String PREF_INSTALL_TARGET_CODE = "install_target_code";

    // 等用户去设置里授予“安装未知应用”权限
    private static final String STATE_AWAITING_PERMISSION = "awaiting_permission";
    // 安装器已经调起，等用户装完或取消后回到应用
    private static final String STATE_AWAITING_RESULT = "awaiting_result";
    // 安装已确认成功（版本号已经涨上去）
    private static final String STATE_COMPLETED = "completed";

    private static final int CONNECT_TIMEOUT_MS = 20000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final int BUFFER_SIZE = 64 * 1024;
    private static final String USER_AGENT = "DailyCanvasUpdater/1.0 (Android)";

    private volatile boolean downloading = false;
    private volatile boolean cancelRequested = false;
    private Thread downloadThread;

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();

        try {
            PackageManager packageManager = context.getPackageManager();
            PackageInfo packageInfo = packageManager.getPackageInfo(context.getPackageName(), 0);
            long versionCode = readVersionCode(packageInfo);
            String installState = readPref(PREF_INSTALL_STATE);

            // 安装过程中应用可能被杀掉，重启后靠版本号判断这次更新到底成没成
            if (STATE_AWAITING_RESULT.equals(installState)
                    && parseTargetVersionCode() > 0
                    && versionCode >= parseTargetVersionCode()) {
                clearPending();
                installState = STATE_COMPLETED;
            }

            result.put("platform", "android");
            result.put("packageName", context.getPackageName());
            result.put("versionName", packageInfo.versionName == null ? "" : packageInfo.versionName);
            result.put("versionCode", versionCode);
            result.put("appName", context.getApplicationInfo().loadLabel(packageManager).toString());
            result.put("canInstallPackages", canInstallPackages(context));
            result.put("pendingApkPath", readPref(PREF_PENDING_PATH));
            result.put("pendingVersionName", readPref(PREF_PENDING_VERSION));
            result.put("installState", installState);
        } catch (PackageManager.NameNotFoundException exception) {
            call.reject("读取应用版本信息失败: " + exception.getMessage());
            return;
        }

        call.resolve(result);
    }

    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        if (downloading) {
            call.reject("已有下载任务正在进行，请稍候");
            return;
        }

        final String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("缺少下载地址");
            return;
        }

        final String expectedSha256 = call.getString("sha256");
        String requestedFileName = call.getString("fileName");
        final String versionName = call.getString("versionName", "");
        final int targetVersionCode = readTargetVersionCodeFromCall(call);
        final String fileName = sanitizeFileName(
                requestedFileName == null || requestedFileName.trim().isEmpty()
                        ? "daily-canvas-" + (versionName.isEmpty() ? "latest" : versionName) + ".apk"
                        : requestedFileName);
        final File targetFile = buildTargetFile(fileName);

        downloading = true;
        cancelRequested = false;

        downloadThread = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String sha256 = download(url, targetFile, call);
                    downloading = false;

                    if (cancelRequested) {
                        deleteQuietly(targetFile);
                        resolveOnMainThread(call, new JSObject().put("cancelled", true));
                        return;
                    }

                    JSObject result = new JSObject();
                    result.put("path", targetFile.getAbsolutePath());
                    result.put("size", targetFile.length());
                    result.put("sha256", sha256 == null ? "" : sha256);

                    if (expectedSha256 != null && !expectedSha256.trim().isEmpty()
                            && sha256 != null
                            && !expectedSha256.trim().toLowerCase(Locale.US).equals(sha256)) {
                        deleteQuietly(targetFile);
                        rejectOnMainThread(call, "安装包校验失败，请稍后重试");
                        return;
                    }

                    resolveOnMainThread(call, result);
                    emit("downloadCompleted", result);
                    launchInstallerOnUiThread(targetFile, versionName, targetVersionCode);
                } catch (Exception exception) {
                    downloading = false;
                    deleteQuietly(targetFile);
                    rejectOnMainThread(call, "下载安装包失败: " + exception.getMessage());
                }
            }
        }, "daily-canvas-apk-download");

        downloadThread.start();
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        if (!downloading) {
            call.resolve(new JSObject().put("cancelled", false));
            return;
        }

        cancelRequested = true;
        call.resolve(new JSObject().put("cancelled", true));
    }

    /**
     * 调起 Android 8.0+ 的“安装未知应用”授权页
     */
    @PluginMethod
    public void requestInstallPermission(PluginCall call) {
        Context context = getContext();

        if (canInstallPackages(context)) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }

        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            call.resolve(new JSObject().put("granted", false));
        } catch (Exception exception) {
            // 部分定制系统没有该设置页，退回到应用详情页
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(Uri.parse("package:" + context.getPackageName()));
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallback);
                call.resolve(new JSObject().put("granted", false));
            } catch (Exception innerException) {
                call.reject("打开安装授权设置失败: " + innerException.getMessage());
            }
        }
    }

    /**
     * 安装已经下载完成的安装包（例如用户授权后手动点击“立即安装”）
     */
    @PluginMethod
    public void installDownloadedPackage(PluginCall call) {
        String path = call.getString("path", readPref(PREF_PENDING_PATH));

        if (path == null || path.trim().isEmpty()) {
            call.reject("没有可安装的安装包，请先下载更新");
            return;
        }

        File file = new File(path);
        if (!file.exists() || file.length() == 0) {
            clearPending();
            call.reject("安装包已不存在，请重新下载");
            return;
        }

        boolean launched = launchInstaller(
                file, readPref(PREF_PENDING_VERSION), readTargetVersionCodeFromCall(call));
        JSObject result = new JSObject();
        result.put("launched", launched);
        result.put("needsPermission", !launched);
        call.resolve(result);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();

        final String pendingPath = readPref(PREF_PENDING_PATH);
        if (pendingPath == null || pendingPath.isEmpty()) {
            return;
        }

        File file = new File(pendingPath);
        if (!file.exists()) {
            clearPending();
            return;
        }

        final String installState = readPref(PREF_INSTALL_STATE);

        if (STATE_AWAITING_PERMISSION.equals(installState)) {
            if (!canInstallPackages(getContext())) {
                return;
            }

            // 用户刚在设置里完成授权，回到应用后自动继续安装
            if (launchInstaller(
                    file, readPref(PREF_PENDING_VERSION), parseTargetVersionCode())) {
                emit("installLaunched", new JSObject().put("path", pendingPath));
            }
            return;
        }

        if (STATE_AWAITING_RESULT.equals(installState)) {
            int currentVersionCode = readCurrentVersionCode();
            int targetVersionCode = parseTargetVersionCode();

            if (targetVersionCode > 0 && currentVersionCode >= targetVersionCode) {
                clearPending();
                JSObject completed = new JSObject();
                completed.put("versionCode", currentVersionCode);
                completed.put("installed", true);
                emit("installCompleted", completed);
                return;
            }

            // 用户在系统安装器里点了取消：保留安装包，回到关于页可以直接重试，不必重新下载
            JSObject returned = new JSObject();
            returned.put("versionCode", currentVersionCode);
            returned.put("path", pendingPath);
            returned.put("installed", false);
            emit("installReturned", returned);
        }
    }

    @Override
    protected void handleOnDestroy() {
        cancelRequested = true;
        super.handleOnDestroy();
    }

    // ------------------------------------------------------------------
    // 内部实现
    // ------------------------------------------------------------------

    private String download(String url, File targetFile, PluginCall call) throws Exception {
        HttpURLConnection connection = null;
        InputStream inputStream = null;
        FileOutputStream outputStream = null;
        MessageDigest digest = MessageDigest.getInstance("SHA-256");

        try {
            File parent = targetFile.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                throw new IllegalStateException("无法创建下载目录");
            }

            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setRequestProperty("User-Agent", USER_AGENT);
            connection.setRequestProperty("Accept", "application/octet-stream,*/*");
            connection.connect();

            int statusCode = connection.getResponseCode();
            if (statusCode < 200 || statusCode >= 300) {
                throw new IllegalStateException("服务端返回 " + statusCode);
            }

            long total = connection.getContentLengthLong();
            long downloaded = 0L;
            long lastReportedPercent = -1L;

            inputStream = new BufferedInputStream(connection.getInputStream(), BUFFER_SIZE);
            outputStream = new FileOutputStream(targetFile, false);

            byte[] buffer = new byte[BUFFER_SIZE];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                if (cancelRequested) {
                    return null;
                }

                outputStream.write(buffer, 0, read);
                digest.update(buffer, 0, read);
                downloaded += read;

                if (total > 0 && hasListeners("downloadProgress")) {
                    long percent = downloaded * 100 / total;
                    if (percent != lastReportedPercent) {
                        lastReportedPercent = percent;
                        JSObject progress = new JSObject();
                        progress.put("percent", (int) percent);
                        progress.put("received", downloaded);
                        progress.put("total", total);
                        emit("downloadProgress", progress);
                    }
                }
            }

            outputStream.flush();
            StringBuilder builder = new StringBuilder();
            for (byte value : digest.digest()) {
                builder.append(String.format(Locale.US, "%02x", value & 0xff));
            }
            return builder.toString();
        } finally {
            closeQuietly(inputStream);
            closeQuietly(outputStream);
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    /**
     * 调起系统安装器，返回是否已经成功调起
     */
    private boolean launchInstaller(File apkFile, String versionName, int targetVersionCode) {
        Context context = getContext();

        if (!canInstallPackages(context)) {
            rememberPending(apkFile, versionName, targetVersionCode, STATE_AWAITING_PERMISSION);
            return false;
        }

        try {
            Uri apkUri = FileProvider.getUriForFile(
                    context, context.getPackageName() + ".fileprovider", apkFile);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            // 先记下待安装信息再调起安装器：
            // 用户在系统安装器里取消时，回到应用仍然可以「重试安装」，而不是重新下载一遍；
            // 真正安装成功后，由版本号比对确认并清除这条记录。
            rememberPending(apkFile, versionName, targetVersionCode, STATE_AWAITING_RESULT);
            context.startActivity(intent);
            return true;
        } catch (Exception exception) {
            rememberPending(apkFile, versionName, targetVersionCode, STATE_AWAITING_PERMISSION);
            emit("installFailed", new JSObject().put("message", String.valueOf(exception.getMessage())));
            return false;
        }
    }

    private void rememberPending(
            File apkFile, String versionName, int targetVersionCode, String state) {
        writePref(PREF_PENDING_PATH, apkFile.getAbsolutePath());
        writePref(PREF_PENDING_VERSION, versionName == null ? "" : versionName);
        writePref(PREF_INSTALL_TARGET_CODE, String.valueOf(Math.max(0, targetVersionCode)));
        writePref(PREF_INSTALL_STATE, state);
    }

    /**
     * 下载线程里不能直接拉起 Activity，统一切回主线程执行
     */
    private void launchInstallerOnUiThread(
            final File apkFile, final String versionName, final int targetVersionCode) {
        Runnable installTask = new Runnable() {
            @Override
            public void run() {
                boolean launched = launchInstaller(apkFile, versionName, targetVersionCode);
                if (!launched) {
                    // 已保存待安装文件，等用户在设置里授权后回到应用自动继续安装
                    emit("installPermissionRequired", new JSObject());
                }
            }
        };

        if (getActivity() == null) {
            installTask.run();
            return;
        }

        getActivity().runOnUiThread(installTask);
    }

    private boolean canInstallPackages(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return context.getPackageManager().canRequestPackageInstalls();
        }

        return true;
    }

    private File buildTargetFile(String fileName) {
        Context context = getContext();
        File directory = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);

        if (directory == null) {
            directory = new File(context.getCacheDir(), "downloads");
        }

        // 每次下载前清掉旧包，避免占用空间
        File[] existing = directory.listFiles();
        if (existing != null) {
            for (File file : existing) {
                if (file.isFile() && file.getName().toLowerCase(Locale.US).endsWith(".apk")) {
                    deleteQuietly(file);
                }
            }
        }

        return new File(directory, fileName);
    }

    private String sanitizeFileName(String fileName) {
        return fileName.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    private long readVersionCode(PackageInfo packageInfo) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return packageInfo.getLongVersionCode();
        }

        return packageInfo.versionCode;
    }

    /**
     * 当前安装包的版本号，用于判断调起的安装是否真的装成功了。
     */
    private int readCurrentVersionCode() {
        try {
            PackageInfo packageInfo = getContext()
                    .getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
            long code = readVersionCode(packageInfo);
            return (int) Math.min(Integer.MAX_VALUE, Math.max(0L, code));
        } catch (PackageManager.NameNotFoundException exception) {
            return 0;
        }
    }

    private int readTargetVersionCodeFromCall(PluginCall call) {
        Integer versionCode = call.getInt("versionCode");
        if (versionCode != null && versionCode > 0) {
            return versionCode;
        }

        return parseTargetVersionCode();
    }

    private int parseTargetVersionCode() {
        return parseIntPref(PREF_INSTALL_TARGET_CODE);
    }

    private int parseIntPref(String key) {
        String raw = readPref(key);
        if (raw == null || raw.isEmpty()) {
            return 0;
        }

        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    private void emit(final String eventName, final JSObject data) {
        if (!hasListeners(eventName)) {
            return;
        }

        if (getActivity() == null) {
            notifyListeners(eventName, data);
            return;
        }

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                notifyListeners(eventName, data);
            }
        });
    }

    private void resolveOnMainThread(final PluginCall call, final JSObject data) {
        if (getActivity() == null) {
            call.resolve(data);
            return;
        }

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                call.resolve(data);
            }
        });
    }

    private void rejectOnMainThread(final PluginCall call, final String message) {
        if (getActivity() == null) {
            call.reject(message);
            return;
        }

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                call.reject(message);
            }
        });
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private String readPref(String key) {
        return preferences().getString(key, "");
    }

    private void writePref(String key, String value) {
        preferences().edit().putString(key, value).apply();
    }

    private void clearPending() {
        preferences()
                .edit()
                .remove(PREF_PENDING_PATH)
                .remove(PREF_PENDING_VERSION)
                .remove(PREF_INSTALL_STATE)
                .remove(PREF_INSTALL_TARGET_CODE)
                .apply();
    }

    private void closeQuietly(java.io.Closeable closeable) {
        if (closeable == null) {
            return;
        }

        try {
            closeable.close();
        } catch (Exception ignored) {
            // 忽略关闭异常
        }
    }

    private void deleteQuietly(File file) {
        if (file != null && file.exists()) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
    }
}
