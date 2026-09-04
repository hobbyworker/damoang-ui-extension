import Foundation
import DamoangUICore

/// 안내 화면에 그릴 상태.
struct ContainerPageState: Equatable {
    let platform: String
    let extensionEnabled: Bool?
    let syncStatus: SyncStatus
}

protocol ContainerView: AnyObject {
    func render(_ state: ContainerPageState)
}

/// 화면 로직. 플랫폼 기능과 유스케이스를 프로토콜로만 받는다.
final class ContainerPresenter {
    private weak var view: ContainerView?
    private let platform: String
    private let status: ExtensionStatusProviding
    private let preferences: SafariPreferencesOpening
    private let links: ExternalLinkOpening
    private let syncStatus: SyncStatusUseCase
    private let terminate: () -> Void

    init(platform: String,
         status: ExtensionStatusProviding,
         preferences: SafariPreferencesOpening,
         links: ExternalLinkOpening,
         syncStatus: SyncStatusUseCase,
         terminate: @escaping () -> Void) {
        self.platform = platform
        self.status = status
        self.preferences = preferences
        self.links = links
        self.syncStatus = syncStatus
        self.terminate = terminate
    }

    func attach(_ view: ContainerView) {
        self.view = view
        refresh()
    }


    private var lastSync = SyncStatus(isAvailable: false, itemCount: 0, lastUpdatedAt: nil)

    /// 동기화 상태는 네트워크 조회라 백그라운드에서 받고, 화면 갱신은 메인에서
    func refresh() {
        view?.render(ContainerPageState(platform: platform, extensionEnabled: nil, syncStatus: lastSync))
        status.fetchIsEnabled { [weak self] enabled in
            guard let self, let view = self.view else { return }
            view.render(ContainerPageState(platform: self.platform, extensionEnabled: enabled, syncStatus: self.lastSync))
        }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let sync = self.syncStatus.execute()
            DispatchQueue.main.async {
                self.lastSync = sync
                self.view?.render(ContainerPageState(platform: self.platform, extensionEnabled: nil, syncStatus: sync))
                self.status.fetchIsEnabled { [weak self] enabled in
                    guard let self, let view = self.view else { return }
                    view.render(ContainerPageState(platform: self.platform, extensionEnabled: enabled, syncStatus: sync))
                }
            }
        }
    }

    /// 안내 페이지에서 온 메시지. "open-preferences" 또는 "open-url:<url>".
    func handle(message: String) {
        if message == "open-preferences" {
            guard preferences.isSupported else { return }
            preferences.openExtensionPreferences { [terminate] ok in
                if ok { terminate() }
            }
            return
        }
        if message.hasPrefix("open-url:"), let url = URL(string: String(message.dropFirst("open-url:".count))),
           ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            links.open(url)
        }
    }
}
