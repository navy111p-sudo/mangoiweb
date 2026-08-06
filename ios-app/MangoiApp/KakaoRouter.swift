import UIKit

/// 카카오톡 채널 상담 링크를 카카오톡 앱으로 바로 넘긴다.
///
/// 안드로이드에서 겪은 문제와 같은 자리다 — 카카오톡이 깔려 있는데도 웹뷰가
/// `pf.kakao.com/.../chat` 을 웹으로 열어 "카카오톡으로 채팅을 시작합니다"
/// 중간 페이지에 갇히던 것. 카카오톡 앱에 직접 넘겨 채팅방으로 바로 들어가게 한다.
///
/// ⚠️ `Info.plist` 의 `LSApplicationQueriesSchemes` 에 `kakaoplus` 가 없으면
///    `canOpenURL` 이 **항상 false** 를 돌려줘 이 코드가 통째로 죽는다.
enum KakaoRouter {

    /// - Returns: 카카오톡으로 넘겼으면 `true`. 카카오톡 미설치 등으로 못 넘겼으면
    ///            `false` 를 돌려주어 호출부가 웹 페이지로 폴백하게 한다
    ///            (그 웹 페이지가 카카오톡 설치를 안내한다).
    @discardableResult
    static func openIfKakaoChannel(_ url: URL) -> Bool {
        guard let host = url.host, host.contains("pf.kakao.com") else { return false }

        // 채널 공개ID = 경로의 첫 조각 (예: pf.kakao.com/_xlqnSxd/chat → _xlqnSxd)
        let segments = url.path.split(separator: "/").map(String.init)
        guard let publicId = segments.first, !publicId.isEmpty else { return false }

        // iOS 에는 안드로이드의 "이 링크를 이 앱이 처리하게 강제(setPackage)" 가 없다.
        // 대신 카카오톡 채널 커스텀 스킴으로 채팅방을 직접 연다.
        guard let scheme = URL(string: "kakaoplus://plusfriend/talk/chat/\(publicId)"),
              UIApplication.shared.canOpenURL(scheme) else {
            return false
        }
        UIApplication.shared.open(scheme, options: [:], completionHandler: nil)
        return true
    }
}
