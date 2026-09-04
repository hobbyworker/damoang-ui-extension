import Foundation

public protocol SettingsSyncRepository {
    var isAvailable: Bool { get }
    /// 저장소를 새로 고친 뒤 전부 읽는다. `refreshTimeout` 동안 외부 변경 알림을 기다릴 수 있다.
    func loadAll(refreshTimeout: TimeInterval) throws -> [SyncedSetting]
    func save(_ items: [SyncedSetting]) throws
}

public extension SettingsSyncRepository {
    func loadAll() throws -> [SyncedSetting] { try loadAll(refreshTimeout: 0) }
}
