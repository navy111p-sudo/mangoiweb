package kr.co.mangoi.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends AppCompatActivity {

    // 테스트 대상 망고아이 웹앱 URL
    private static final String START_URL = "https://test.mangoi.co.kr/";
    // 앱 자동 업데이트 버전 매니페스트 (웹과 같은 도메인 — 사이트 배포 시 함께 갱신)
    private static final String VERSION_URL = "https://test.mangoi.co.kr/app-version.json";

    private static final int REQ_PERMISSIONS = 1001;

    private WebView webView;
    private PermissionRequest pendingWebPermissionRequest;
    private BroadcastReceiver downloadReceiver;

    // ── 네이티브 TTS (AI 상담직원 여자 목소리) ──
    // WebView 에는 speechSynthesis 가 없어 웹의 음성 합성이 전부 무음이다.
    // 안드로이드 시스템 TTS(구글 한국어 = 여성 음성)를 JS 브리지(window.AndroidTTS)로 노출해
    // 상담직원/게임 발음이 앱에서도 자연스러운 목소리로 나오게 한다.
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;

    private ValueCallback<Uri[]> filePathCallback;
    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (filePathCallback == null) return;
                Uri[] results = null;
                if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                    Uri data = result.getData().getData();
                    if (data != null) results = new Uri[]{data};
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        // 시작 시 카메라/마이크 권한 요청 (화상통화 필수)
        requestRuntimePermissions();

        // 시스템 TTS 초기화 (기본 엔진=구글 TTS, 한국어 기본 음성은 여성)
        try {
            tts = new TextToSpeech(getApplicationContext(), status -> {
                ttsReady = (status == TextToSpeech.SUCCESS);
            });
        } catch (Exception ignored) {}

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // 자동재생 허용
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        // 폰의 시스템 글꼴 크기(설정 > 접근성 > 글자 크게)를 무시하고 사이트 설계 크기로 고정한다.
        // 이걸 안 하면 사장님처럼 글꼴을 크게 쓰는 기기에서 모든 페이지 글자가 2~3배로 커져
        // 웜업 등 화면의 문장이 잘려 보인다. (사이트 CSS는 이미 반응형이라 100%가 정상)
        s.setTextZoom(100);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        // target="_blank" / window.open() 링크를 외부 크롬으로 넘기지 않고 앱 안에서 처리하기 위해 필요
        s.setSupportMultipleWindows(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(false);
        }

        // 😊 패스키(WebAuthn) 얼굴/지문 로그인 — Android 14+ / 최신 WebView 에서만 동작.
        //   미지원 기기는 feature 체크로 건너뛰고, 사이트 쪽 버튼도 자동 숨김이라 안전.
        //   도메인 신뢰는 test.mangoi.co.kr/.well-known/assetlinks.json (kr.co.mangoi.app 지문) 이 담당.
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
                WebSettingsCompat.setWebAuthenticationSupport(s, WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP);
            }
        } catch (Throwable ignored) {}

        // JS 브리지: 페이지에서 window.AndroidTTS.speak('안녕', 'ko', 1.05, 1.0) 로 호출
        webView.addJavascriptInterface(new TtsBridge(), "AndroidTTS");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String scheme = url.getScheme();
                // 카카오톡 채널(pf.kakao.com) 링크는 웹 중간페이지 없이 카카오톡 앱 채팅으로 바로
                if (openKakaoChannelInApp(url)) return true;
                // http/https 는 WebView 내에서, 그 외(tel, mailto, intent 등)는 외부 앱으로
                if (scheme != null && (scheme.equals("http") || scheme.equals("https"))) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (Exception ignored) {}
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            // getUserMedia (카메라/마이크) 권한 요청 자동 승인
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    pendingWebPermissionRequest = request;
                    boolean hasCam = ContextCompat.checkSelfPermission(MainActivity.this,
                            Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
                    boolean hasMic = ContextCompat.checkSelfPermission(MainActivity.this,
                            Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
                    if (hasCam && hasMic) {
                        request.grant(request.getResources());
                        pendingWebPermissionRequest = null;
                    } else {
                        requestRuntimePermissions();
                    }
                });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            // target="_blank" / window.open() 새 창 요청을 가로채서
            // 외부 크롬(방문 기록 화면)으로 튕기지 않고 앱 WebView 안에서 열도록 처리
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                final WebView tempView = new WebView(view.getContext());
                tempView.getSettings().setJavaScriptEnabled(true);
                final boolean[] handled = {false};
                tempView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                        if (!handled[0]) {
                            routeNewWindowUrl(request.getUrl(), handled);
                            destroyTemp(v);
                        }
                        return true;
                    }
                    // window.open(url) 은 첫 로딩이 shouldOverride 를 안 거치는 경우가 있어 보강
                    @Override
                    public void onPageStarted(WebView v, String url, Bitmap favicon) {
                        if (!handled[0] && url != null && !"about:blank".equals(url)) {
                            routeNewWindowUrl(Uri.parse(url), handled);
                            destroyTemp(v);
                        }
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(tempView);
                resultMsg.sendToTarget();
                return true;
            }

            // 파일 업로드(첨부) 지원
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    fileChooserLauncher.launch(intent);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        // ★ (v1.7) 옛 캐시 자동 탈출 — APK를 "덮어 설치"하면 안드로이드가 이전 앱의
        //   WebView 저장데이터(옛 서비스워커 캐시=몇 주 전 홈 화면)를 그대로 물려줘
        //   "앱이 옛날 것"으로 보이던 문제의 근본 대책 2중장치:
        //   ① 앱 버전이 올라간 첫 실행이면 HTTP 캐시 청소
        //   ② 시작 URL 에 실행마다 고유 쿼리(_app=시각) — 옛 SW 캐시 키와 절대 안 겹쳐 항상 네트워크 최신 HTML
        try {
            android.content.SharedPreferences sp = getSharedPreferences("mangoi", MODE_PRIVATE);
            int lastVc = sp.getInt("last_vc", 0);
            int curVc = BuildConfig.VERSION_CODE;
            if (curVc > lastVc) {
                webView.clearCache(true);
                sp.edit().putInt("last_vc", curVc).apply();
            }
        } catch (Exception ignore) {}
        if (savedInstanceState == null) {
            webView.loadUrl(START_URL + "?_app=" + System.currentTimeMillis());
        } else {
            webView.restoreState(savedInstanceState);
        }

        // 앱(APK) 자체 자동 업데이트 확인 — 더 높은 버전이 있으면 안내 후 설치
        checkForUpdate();
    }

    // ====================== 앱 자동 업데이트 ======================

    /** 서버의 app-version.json 을 읽어 현재 설치 버전보다 높으면 업데이트 안내 */
    private void checkForUpdate() {
        new Thread(() -> {
            try {
                URL u = new URL(VERSION_URL + "?t=" + System.currentTimeMillis());
                HttpURLConnection c = (HttpURLConnection) u.openConnection();
                c.setConnectTimeout(6000);
                c.setReadTimeout(6000);
                c.setRequestProperty("Cache-Control", "no-cache");
                if (c.getResponseCode() != 200) return;
                StringBuilder sb = new StringBuilder();
                BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                br.close();
                c.disconnect();

                JSONObject j = new JSONObject(sb.toString());
                int remoteCode = j.optInt("versionCode", 0);
                final String url = j.optString("url", "");
                final String notes = j.optString("notes", "");
                final String vname = j.optString("versionName", "");
                int current = BuildConfig.VERSION_CODE;

                if (remoteCode > current && url != null && !url.isEmpty()) {
                    runOnUiThread(() -> promptUpdate(url, notes, vname));
                }
            } catch (Exception ignored) {
                // 네트워크 실패 등은 조용히 무시 (수업 진행에 영향 없음)
            }
        }).start();
    }

    private void promptUpdate(final String url, String notes, String vname) {
        if (isFinishing()) return;
        String msg = (notes == null || notes.isEmpty()) ? "새 버전이 있습니다." : notes;
        new AlertDialog.Builder(this)
                .setTitle("업데이트" + (vname == null || vname.isEmpty() ? "" : " " + vname))
                .setMessage(msg + "\n\n지금 업데이트할까요?")
                .setPositiveButton("업데이트", (d, w) -> startDownload(url))
                .setNegativeButton("나중에", null)
                .setCancelable(true)
                .show();
    }

    private void startDownload(final String url) {
        // Android 8.0+ : '알 수 없는 앱 설치' 권한 확인 → 없으면 설정으로 유도
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getPackageManager().canRequestPackageInstalls()) {
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())));
            } catch (Exception ignored) {}
            // 권한 허용 후 다시 시도하도록 안내만 하고 종료
            try {
                new AlertDialog.Builder(this)
                        .setMessage("이 앱의 '설치 허용'을 켠 뒤 다시 '업데이트'를 눌러주세요.")
                        .setPositiveButton("확인", null).show();
            } catch (Exception ignored) {}
            return;
        }
        try {
            final String fileName = "mangoi-update.apk";
            // 이전 받은 파일 정리
            File old = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);
            if (old.exists()) old.delete();

            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle("망고아이 업데이트");
            req.setDescription("새 버전을 내려받는 중…");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
            req.setMimeType("application/vnd.android.package-archive");
            final long id = dm.enqueue(req);

            // 이전 다운로드가 완료되지 않은 채 다시 눌린 경우 — 리시버 중복 등록 방지
            unregisterDownloadReceiver();

            downloadReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context ctx, Intent it) {
                    long got = it.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (got != id) return;
                    unregisterDownloadReceiver();
                    File apk = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);
                    installApk(apk);
                }
            };
            IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED);
            } else {
                registerReceiver(downloadReceiver, filter);
            }
        } catch (Exception e) {
            // 폴백: 브라우저로 APK 링크 열기
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
        }
    }

    private void unregisterDownloadReceiver() {
        if (downloadReceiver == null) return;
        try { unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
        downloadReceiver = null;
    }

    private void installApk(File apk) {
        if (apk == null || !apk.exists()) return;
        try {
            Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(apkUri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) {}
    }

    /**
     * 새 창(target="_blank"/window.open) 으로 요청된 URL 을 처리한다.
     * http/https 는 메인 WebView 에서 그대로 열어 앱 안에 머물게 하고,
     * tel·mailto·intent·kakao 등 특수 스킴만 외부 앱으로 넘긴다.
     * handled 플래그로 shouldOverride/onPageStarted 중복 실행을 막는다.
     */
    private void routeNewWindowUrl(Uri url, boolean[] handled) {
        if (url == null || handled[0]) return;
        handled[0] = true;
        // 카카오톡 채널 링크는 카카오톡 앱으로 직접 넘겨 채팅 바로 진입 (상담 버튼 등)
        if (openKakaoChannelInApp(url)) return;
        String scheme = url.getScheme();
        if (scheme != null && (scheme.equals("http") || scheme.equals("https"))) {
            if (webView != null) webView.loadUrl(url.toString());
        } else {
            try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) {}
        }
    }

    /**
     * 카카오톡 채널 링크(pf.kakao.com/…)면 카카오톡 앱으로 직접 넘겨 채팅을 바로 연다.
     * 카카오톡이 설치돼 있으면 웹 중간 페이지("카카오톡으로 채팅을 시작합니다") 없이
     * 곧장 앱 채팅으로 진입한다. 미설치면 false 를 돌려주어 호출부가 웹 페이지로
     * 폴백(그 페이지가 카카오톡 설치를 안내)하도록 한다.
     */
    private boolean openKakaoChannelInApp(Uri url) {
        if (url == null) return false;
        String host = url.getHost();
        if (host == null || !host.contains("pf.kakao.com")) return false;

        // 1순위: 카카오톡이 pf.kakao.com 링크(App Link)를 직접 처리하도록 강제
        //         → /chat 경로 그대로 넘어가 1:1 채팅으로 바로 진입
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, url);
            i.setPackage("com.kakao.talk");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            return true;
        } catch (Exception ignored) {}

        // 2순위: 카카오톡 채널 커스텀 스킴으로 채팅 열기
        //         채널 공개ID = pf.kakao.com/{id}/... 의 첫 경로 세그먼트(예: _xlqnSxd)
        try {
            String publicId = null;
            java.util.List<String> segs = url.getPathSegments();
            if (segs != null && !segs.isEmpty()) publicId = segs.get(0);
            if (publicId != null && !publicId.isEmpty()) {
                Intent i = new Intent(Intent.ACTION_VIEW,
                        Uri.parse("kakaoplus://plusfriend/talk/chat/" + publicId));
                i.setPackage("com.kakao.talk");
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                return true;
            }
        } catch (Exception ignored) {}

        return false; // 카카오톡 미설치/미대응 → 웹 채팅 페이지로 폴백
    }

    // ====================== 네이티브 TTS 브리지 ======================

    /** 페이지 JS 에서 쓰는 음성 합성 브리지 — window.AndroidTTS.* */
    private class TtsBridge {
        @JavascriptInterface
        public boolean isReady() { return ttsReady && tts != null; }

        /**
         * @param text  읽을 문장
         * @param lang  "ko" | "en" | "zh" (그 외는 ko)
         * @param pitch 1.0=원음, 1.05~1.15=여성 톤 강조 (0 이하는 1.05)
         * @param rate  말 속도 (0 이하는 1.0)
         */
        @JavascriptInterface
        public void speak(String text, String lang, float pitch, float rate) {
            if (!isReady() || text == null || text.trim().isEmpty()) return;
            try {
                java.util.Locale loc = java.util.Locale.KOREAN;
                if (lang != null) {
                    String l = lang.toLowerCase();
                    if (l.startsWith("en")) loc = java.util.Locale.US;
                    else if (l.startsWith("zh") || l.startsWith("cn")) loc = java.util.Locale.SIMPLIFIED_CHINESE;
                }
                tts.setLanguage(loc);
                tts.setPitch(pitch > 0 ? pitch : 1.05f);
                tts.setSpeechRate(rate > 0 ? rate : 1.0f);
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "mangoi-tts");
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void stop() {
            try { if (tts != null) tts.stop(); } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public boolean isSpeaking() {
            try { return tts != null && tts.isSpeaking(); } catch (Exception e) { return false; }
        }
    }

    /** 새 창 처리용 임시 WebView 를 안전하게 정리(메모리 누수 방지) */
    private void destroyTemp(final WebView v) {
        if (v == null) return;
        try { v.stopLoading(); } catch (Exception ignored) {}
        v.post(() -> { try { v.destroy(); } catch (Exception ignored) {} });
    }

    private void requestRuntimePermissions() {
        String[] perms = {Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO,
                Manifest.permission.MODIFY_AUDIO_SETTINGS};
        ActivityCompat.requestPermissions(this, perms, REQ_PERMISSIONS);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMISSIONS && pendingWebPermissionRequest != null) {
            boolean hasCam = ContextCompat.checkSelfPermission(this,
                    Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
            boolean hasMic = ContextCompat.checkSelfPermission(this,
                    Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
            if (hasCam && hasMic) {
                pendingWebPermissionRequest.grant(pendingWebPermissionRequest.getResources());
            } else {
                pendingWebPermissionRequest.deny();
            }
            pendingWebPermissionRequest = null;
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        unregisterDownloadReceiver();
        try { if (tts != null) { tts.stop(); tts.shutdown(); tts = null; } } catch (Exception ignored) {}
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
