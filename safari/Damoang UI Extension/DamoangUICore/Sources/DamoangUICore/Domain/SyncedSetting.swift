import Foundation

/// 확장 설정 한 항목의 동기화 스냅샷. json 이 nil 이면 삭제된 항목이다.
public struct SyncedSetting: Equatable, Sendable {
    public let key: String
    public let json: String?
    public let updatedAt: Double

    public init(key: String, json: String?, updatedAt: Double) {
        self.key = key
        self.json = json
        self.updatedAt = updatedAt
    }

    public var isDeleted: Bool { json == nil }
}

public struct SyncStatus: Equatable, Sendable {
    public let isAvailable: Bool
    public let itemCount: Int
    public let lastUpdatedAt: Double?

    public init(isAvailable: Bool, itemCount: Int, lastUpdatedAt: Double?) {
        self.isAvailable = isAvailable
        self.itemCount = itemCount
        self.lastUpdatedAt = lastUpdatedAt
    }
}
