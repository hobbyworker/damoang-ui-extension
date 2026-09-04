import Foundation

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
import SafariServices
#endif

/// 안내 화면이 필요로 하는 플랫폼 기능. 컨트롤러는 이 프로토콜만 안다.
protocol ExtensionStatusProviding {
    /// nil 이면 이 플랫폼에서는 상태를 알 수 없다 (iOS).
    func fetchIsEnabled(_ completion: @escaping (Bool?) -> Void)
}

protocol SafariPreferencesOpening {
    var isSupported: Bool { get }
    func openExtensionPreferences(_ completion: @escaping (Bool) -> Void)
}

protocol ExternalLinkOpening {
    func open(_ url: URL)
}

let extensionBundleIdentifier = "me.hobbyworker.DamoangUIExtension.Extension"

#if os(macOS)
struct SafariExtensionStatusProvider: ExtensionStatusProviding {
    func fetchIsEnabled(_ completion: @escaping (Bool?) -> Void) {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { state, error in
            DispatchQueue.main.async { completion(error == nil ? state?.isEnabled : nil) }
        }
    }
}

struct SafariPreferencesOpener: SafariPreferencesOpening {
    var isSupported: Bool { true }
    func openExtensionPreferences(_ completion: @escaping (Bool) -> Void) {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            DispatchQueue.main.async { completion(error == nil) }
        }
    }
}

struct WorkspaceLinkOpener: ExternalLinkOpening {
    func open(_ url: URL) { NSWorkspace.shared.open(url) }
}
#elseif os(iOS)
struct UnavailableExtensionStatusProvider: ExtensionStatusProviding {
    func fetchIsEnabled(_ completion: @escaping (Bool?) -> Void) { completion(nil) }
}

struct UnsupportedPreferencesOpener: SafariPreferencesOpening {
    var isSupported: Bool { false }
    func openExtensionPreferences(_ completion: @escaping (Bool) -> Void) { completion(false) }
}

struct ApplicationLinkOpener: ExternalLinkOpening {
    func open(_ url: URL) { UIApplication.shared.open(url) }
}
#endif
