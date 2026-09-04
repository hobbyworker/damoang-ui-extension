import Foundation
import DamoangUICore

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// 조립 지점. 플랫폼별 구현체를 고르는 유일한 곳.
enum AppAssembly {
    static func makeContainerPresenter() -> ContainerPresenter {
#if os(macOS)
        return ContainerPresenter(
            platform: "mac",
            status: SafariExtensionStatusProvider(),
            preferences: SafariPreferencesOpener(),
            links: WorkspaceLinkOpener(),
            syncStatus: CoreAssembly.makeStatus(),
            terminate: { NSApp.terminate(nil) })
#else
        return ContainerPresenter(
            platform: "ios",
            status: UnavailableExtensionStatusProvider(),
            preferences: UnsupportedPreferencesOpener(),
            links: ApplicationLinkOpener(),
            syncStatus: CoreAssembly.makeStatus(),
            terminate: {})
#endif
    }
}
