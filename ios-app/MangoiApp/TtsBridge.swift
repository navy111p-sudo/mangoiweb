import UIKit
import WebKit
import AVFoundation

/// 네이티브 음성 합성 브리지.
///
/// 사이트의 게임 5종(문법피자·랭귀지에이스·P-38·탱크배틀·테트리스)이 이미
/// `window.AndroidTTS.isReady() / speak() / stop() / isSpeaking()` 를 쓰고 있고,
/// 없으면 서버 TTS 로 폴백하도록 짜여 있다.
/// 그래서 iOS 에서도 **같은 이름·같은 모양**으로 심어주면 사이트 코드를 한 줄도
/// 고치지 않고 아이폰 시스템 음성이 그대로 붙는다.
///
/// 안드로이드 브리지는 동기 함수(`isReady()` 가 즉시 boolean 반환)인데
/// WKWebView 의 메시지 핸들러는 비동기라, JS 쪽에 상태 플래그를 두고
/// 네이티브가 그 플래그를 갱신하는 방식으로 같은 모양을 만든다.
final class TtsBridge: NSObject {

    static let handlerName = "mangoiTTS"

    weak var webView: WKWebView?

    private let synthesizer = AVSpeechSynthesizer()

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    /// 페이지에 먼저 심어지는 자바스크립트 껍데기 (documentStart 주입)
    static let shimJS = """
    (function () {
      if (window.AndroidTTS) { return; }
      var ready = true;      // AVSpeechSynthesizer 는 iOS 에 항상 있다
      var speaking = false;
      function post(cmd, body) {
        try {
          var msg = { cmd: cmd };
          if (body) { for (var k in body) { msg[k] = body[k]; } }
          window.webkit.messageHandlers.\(TtsBridge.handlerName).postMessage(msg);
        } catch (e) {}
      }
      window.__mangoiTtsReady = function (v) { ready = !!v; };
      window.__mangoiTtsSpeaking = function (v) { speaking = !!v; };
      window.AndroidTTS = {
        isReady: function () { return ready; },
        isSpeaking: function () { return speaking; },
        speak: function (text, lang, pitch, rate) {
          speaking = true;
          post('speak', {
            text: String(text == null ? '' : text),
            lang: String(lang || 'ko'),
            pitch: Number(pitch) || 0,
            rate: Number(rate) || 0
          });
        },
        stop: function () { speaking = false; post('stop'); }
      };
      window.MangoiApp = {
        platform: 'ios',
        keepAwake: function (on) { post('keepAwake', { on: !!on }); }
      };
    })();
    """

    /// 페이지 로딩이 끝난 뒤 준비 상태를 다시 알려준다
    func notifyReady() {
        webView?.evaluateJavaScript("window.__mangoiTtsReady && window.__mangoiTtsReady(true)")
    }

    private func setSpeakingFlag(_ value: Bool) {
        webView?.evaluateJavaScript("window.__mangoiTtsSpeaking && window.__mangoiTtsSpeaking(\(value))")
    }

    /// "ko" / "en" / "zh" → iOS 음성 로케일. 안드로이드 브리지와 같은 규칙(그 외는 한국어).
    private func voice(for lang: String) -> AVSpeechSynthesisVoice? {
        let l = lang.lowercased()
        let code: String
        if l.hasPrefix("en") {
            code = "en-US"
        } else if l.hasPrefix("zh") || l.hasPrefix("cn") {
            code = "zh-CN"
        } else {
            code = "ko-KR"
        }
        return AVSpeechSynthesisVoice(language: code)
    }
}

// MARK: - JS → 네이티브

extension TtsBridge: WKScriptMessageHandler {

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.handlerName,
              let body = message.body as? [String: Any],
              let cmd = body["cmd"] as? String else { return }

        switch cmd {
        case "speak":
            let text = (body["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { setSpeakingFlag(false); return }
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = voice(for: body["lang"] as? String ?? "ko")

            let pitch = (body["pitch"] as? NSNumber)?.floatValue ?? 0
            utterance.pitchMultiplier = pitch > 0 ? min(max(pitch, 0.5), 2.0) : 1.05

            // 안드로이드의 rate 1.0 = "보통 속도" 인데, iOS 의 1.0 은 최고 속도에 가깝다.
            // 기준값이 서로 달라 그대로 넘기면 아이폰에서만 말이 미친 듯이 빨라진다.
            // iOS 의 보통 속도(AVSpeechUtteranceDefaultSpeechRate ≈ 0.5)를 기준으로 환산한다.
            let rate = (body["rate"] as? NSNumber)?.floatValue ?? 0
            let normalized = (rate > 0 ? rate : 1.0) * AVSpeechUtteranceDefaultSpeechRate
            utterance.rate = min(max(normalized, AVSpeechUtteranceMinimumSpeechRate),
                                 AVSpeechUtteranceMaximumSpeechRate)

            synthesizer.stopSpeaking(at: .immediate)   // 안드로이드 QUEUE_FLUSH 와 같은 동작
            setSpeakingFlag(true)
            synthesizer.speak(utterance)

        case "stop":
            synthesizer.stopSpeaking(at: .immediate)
            setSpeakingFlag(false)

        case "keepAwake":
            // 수업·게임 중 화면이 저절로 꺼지지 않게 한다
            let on = (body["on"] as? Bool) ?? false
            UIApplication.shared.isIdleTimerDisabled = on

        default:
            break
        }
    }
}

// MARK: - 네이티브 → JS (말이 끝난 시점 알림)

extension TtsBridge: AVSpeechSynthesizerDelegate {

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        setSpeakingFlag(false)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        setSpeakingFlag(false)
    }
}
