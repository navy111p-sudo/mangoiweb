import UIKit
import AVFoundation

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureAudioSession()
        return true
    }

    /// 화상수업 오디오 라우팅.
    ///
    /// 이걸 안 하면 WebRTC 소리가 **통화용 수화기(귀에 대는 작은 스피커)** 로 나가서
    /// "선생님 목소리가 하나도 안 들려요" 신고가 들어온다. 아이폰의 기본 동작이다.
    /// `.videoChat` 모드 + `.defaultToSpeaker` 로 큰 스피커를 기본으로 잡는다.
    ///
    /// ⚠️ 실기기 검증 필요 — WebKit 이 getUserMedia 시점에 오디오 세션을 다시 건드리는
    ///    경우가 있어, 아이폰 실물에서 (1)스피커로 나오는지 (2)블루투스 이어폰 전환되는지
    ///    (3)에어팟 낀 채 수업 → 뺐을 때 소리가 이어지는지 3가지를 반드시 확인할 것.
    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playAndRecord,
                mode: .videoChat,
                options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
            )
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            // 오디오 세션 설정 실패가 앱 실행을 막아서는 안 된다 — 기본 라우팅으로 진행
            NSLog("[Mangoi] audio session 설정 실패: \(error.localizedDescription)")
        }
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }
}
