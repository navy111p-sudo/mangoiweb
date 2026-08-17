import UIKit
import WebKit

/// 망고아이 웹앱(mangoi.ai)을 감싸는 단일 화면.
///
/// 안드로이드 `MainActivity.java` 와 같은 역할이며, 거기서 겪고 고쳤던 문제들을
/// iOS 방식으로 그대로 이식했다. 대응표는 ios-app/README.md 참조.
final class WebViewController: UIViewController {

    /// 웹앱 주소 — 안드로이드와 동일 (2026-08-17 test.mangoi.co.kr → mangoi.ai)
    ///
    /// ⚠️ 이 값은 앱 바이너리에 박힌다. 이미 깔린 앱은 새 빌드가 퍼질 때까지 옛 주소를 계속 본다.
    ///    옛 도메인을 먼저 죽이면 그 사람들 앱이 흰 화면이 된다.
    /// ⚠️ 오리진이 바뀌므로 이 버전을 처음 켠 사람은 한 번 로그아웃된다(학생 로그인 = localStorage).
    private static let startURL = "https://mangoi.ai/"

    private var webView: WKWebView!
    private let tts = TtsBridge()

    // MARK: - 화면 구성

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.02, green: 0.03, blue: 0.08, alpha: 1) // #050714
        setUpWebView()
        clearCacheIfUpdated()
        loadStart()
    }

    private func setUpWebView() {
        let config = WKWebViewConfiguration()

        // 자동재생 허용 — 안드로이드 setMediaPlaybackRequiresUserGesture(false) 와 같은 뜻.
        // 이게 없으면 수업 입장음·게임 효과음·영상이 사용자가 누르기 전엔 안 나온다.
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsInlineMediaPlayback = true          // 영상이 전체화면으로 튀지 않게
        config.allowsPictureInPictureMediaPlayback = true

        // 로그인 상태(localStorage)가 앱을 껐다 켜도 남아 있어야 한다
        config.websiteDataStore = .default()

        // 네이티브 음성 브리지 — 사이트는 window.AndroidTTS 를 이미 쓰고 있으므로
        // 같은 이름·같은 모양으로 iOS 에도 심어주면 사이트 수정 없이 그대로 동작한다.
        let ucc = WKUserContentController()
        ucc.add(tts, name: TtsBridge.handlerName)
        ucc.addUserScript(WKUserScript(source: TtsBridge.shimJS,
                                       injectionTime: .atDocumentStart,
                                       forMainFrameOnly: false))
        config.userContentController = ucc

        webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        tts.webView = webView

        // 아이폰엔 뒤로가기 버튼이 없다 — 화면 왼쪽 가장자리 스와이프로 뒤로 가게 한다.
        // (안드로이드 onKeyDown(KEYCODE_BACK) 자리)
        webView.allowsBackForwardNavigationGestures = true

        // 서버·사이트가 "앱에서 열린 화면"인지 구분할 수 있게 표식을 남긴다
        if let ua = webView.value(forKey: "userAgent") as? String {
            webView.customUserAgent = ua + " MangoiApp/iOS"
        } else {
            webView.customUserAgent = "MangoiApp/iOS"
        }

        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    /// 앱 버전이 올라간 첫 실행이면 웹 캐시를 청소한다.
    /// (안드로이드 v1.7 에서 "APK 새로 받았는데 옛 화면이 나온다" 를 잡았던 그 장치)
    private func clearCacheIfUpdated() {
        let key = "last_build"
        let current = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        let last = UserDefaults.standard.string(forKey: key)
        guard last != current else { return }
        UserDefaults.standard.set(current, forKey: key)

        // 로그인 상태(쿠키·localStorage)는 남기고 캐시성 데이터만 지운다.
        // 여기에 .cookies / .localStorage 를 넣으면 업데이트할 때마다 로그아웃돼 버린다.
        let types: Set<String> = [
            WKWebsiteDataTypeDiskCache,
            WKWebsiteDataTypeMemoryCache,
            WKWebsiteDataTypeOfflineWebApplicationCache,
            WKWebsiteDataTypeServiceWorkerRegistrations
        ]
        WKWebsiteDataStore.default().removeData(ofTypes: types,
                                                modifiedSince: Date(timeIntervalSince1970: 0)) {}
    }

    /// 실행할 때마다 고유한 쿼리를 붙여 옛 서비스워커 캐시 키와 절대 겹치지 않게 한다.
    /// (안드로이드의 `?_app=시각` 과 동일)
    private func loadStart() {
        let stamp = Int(Date().timeIntervalSince1970 * 1000)
        guard let url = URL(string: "\(Self.startURL)?_app=\(stamp)") else { return }
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}

// MARK: - 화면 이동 / 링크 처리

extension WebViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow); return
        }

        // 카카오톡 채널 상담 링크는 카카오톡 앱 채팅으로 바로 넘긴다
        if KakaoRouter.openIfKakaoChannel(url) {
            decisionHandler(.cancel); return
        }

        // http/https 는 앱 안에서, tel·mailto·sms 등 특수 스킴은 시스템에 넘긴다
        if let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            decisionHandler(.allow)
        } else {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        tts.notifyReady()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showLoadFailure(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showLoadFailure(error)
    }

    /// 통신이 끊겨 화면이 하얗게 뜨는 대신, 무엇을 하면 되는지 한국어로 알려준다.
    private func showLoadFailure(_ error: Error) {
        // 사용자가 스스로 화면을 벗어난 경우(취소)는 오류가 아니다
        if (error as NSError).code == NSURLErrorCancelled { return }
        let alert = UIAlertController(
            title: "연결할 수 없습니다",
            message: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.\n(\(error.localizedDescription))",
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "다시 시도", style: .default) { [weak self] _ in
            self?.loadStart()
        })
        alert.addAction(UIAlertAction(title: "닫기", style: .cancel))
        present(alert, animated: true)
    }
}

// MARK: - 새 창 / 카메라·마이크 / 자바스크립트 대화상자

extension WebViewController: WKUIDelegate {

    /// target="_blank" · window.open() 새 창 요청.
    /// nil 을 돌려주면 그 링크는 그냥 사라지므로, 메인 웹뷰에서 직접 연다.
    /// (안드로이드에서 링크가 크롬으로 튕겨 앱 복귀가 안 되던 문제와 같은 자리)
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if KakaoRouter.openIfKakaoChannel(url) { return nil }
        if let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            webView.load(URLRequest(url: url))
        } else {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
        return nil
    }

    /// 화상수업의 카메라·마이크 요청을 앱이 승인한다.
    /// (iOS 시스템 권한 팝업은 이것과 별개로 최초 1회 따로 뜬다)
    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        /* 우리 도메인에서 온 요청만 허용한다.
         *
         * ⚠️ 2026-08-17 — 여기에 mangoi.ai 가 없어서, 시작 주소만 옮기면 **화상수업 카메라·마이크가
         *    자동 승인되지 않고 매번 확인창이 뜨는** 상태가 될 뻔했다. 시작 URL 을 바꿀 때 같이 봐야 하는 곳이다.
         * ⚠️ 죽은 도메인 mango-i.com 은 뺐다 — 등록조차 안 된 주소다(NXDOMAIN 실측).
         * ⚠️ hasSuffix 만 쓰면 «evil-mangoi.ai» 같은 남의 도메인도 통과한다.
         *    정확히 일치하거나 «.» 로 시작하는 하위도메인만 우리 것으로 본다.
         */
        let host = origin.host
        func isOurs(_ domain: String) -> Bool { host == domain || host.hasSuffix("." + domain) }
        if isOurs("mangoi.ai") || isOurs("mangoi.co.kr") {
            decisionHandler(.grant)
        } else {
            decisionHandler(.prompt)
        }
    }

    // ── 자바스크립트 대화상자 ──
    // WKWebView 는 이 세 개를 구현하지 않으면 alert/confirm/prompt 를 **조용히 무시**한다.
    // 사이트 곳곳의 확인창이 안 뜨고 아무 반응 없는 것처럼 보이는 원인이 여기다.

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler() })
        presentSafely(alert, fallback: completionHandler)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(true) })
        presentSafely(alert) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "확인", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text)
        })
        presentSafely(alert) { completionHandler(nil) }
    }

    /// 이미 다른 팝업이 떠 있으면 present 가 실패해 completionHandler 가 영영 안 불린다.
    /// 그 상태가 되면 웹 페이지의 자바스크립트가 그 자리에서 멈춰버리므로 폴백을 반드시 호출한다.
    private func presentSafely(_ alert: UIAlertController, fallback: @escaping () -> Void) {
        if presentedViewController != nil {
            fallback()
        } else {
            present(alert, animated: true)
        }
    }
}
