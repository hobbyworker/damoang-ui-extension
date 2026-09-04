import Foundation

public protocol PullSettingsUseCase {
    /// iCloud 에서 내려오는 변경을 `waitingUpTo` 초까지 기다린 뒤 읽는다. 0 이면 로컬 캐시만.
    func execute(waitingUpTo seconds: TimeInterval) throws -> [SyncedSetting]
}

public extension PullSettingsUseCase {
    func execute() throws -> [SyncedSetting] { try execute(waitingUpTo: 0) }
}

public protocol PushSettingsUseCase {
    /// 갱신 시각이 더 최신인 항목만 저장하고, 실제로 저장된 항목을 돌려준다.
    func execute(_ incoming: [SyncedSetting]) throws -> [SyncedSetting]
}

public protocol SyncStatusUseCase {
    func execute() -> SyncStatus
}

public struct DefaultPullSettingsUseCase: PullSettingsUseCase {
    private let repository: SettingsSyncRepository
    public init(repository: SettingsSyncRepository) { self.repository = repository }
    public func execute(waitingUpTo seconds: TimeInterval) throws -> [SyncedSetting] {
        try repository.loadAll(refreshTimeout: seconds).sorted { $0.key < $1.key }
    }
}

public struct DefaultPushSettingsUseCase: PushSettingsUseCase {
    private let repository: SettingsSyncRepository
    public init(repository: SettingsSyncRepository) { self.repository = repository }
    public func execute(_ incoming: [SyncedSetting]) throws -> [SyncedSetting] {
        let current = Dictionary(uniqueKeysWithValues: try repository.loadAll().map { ($0.key, $0) })
        let accepted = incoming.filter { item in
            guard let existing = current[item.key] else { return true }
            return item.updatedAt >= existing.updatedAt
        }
        if !accepted.isEmpty { try repository.save(accepted) }
        return accepted
    }
}

public struct DefaultSyncStatusUseCase: SyncStatusUseCase {
    private let repository: SettingsSyncRepository
    public init(repository: SettingsSyncRepository) { self.repository = repository }
    public func execute() -> SyncStatus {
        guard repository.isAvailable, let items = try? repository.loadAll() else {
            return SyncStatus(isAvailable: repository.isAvailable, itemCount: 0, lastUpdatedAt: nil)
        }
        let live = items.filter { !$0.isDeleted }
        return SyncStatus(isAvailable: true, itemCount: live.count, lastUpdatedAt: items.map(\.updatedAt).max())
    }
}
