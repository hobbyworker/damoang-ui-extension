import Foundation

/// 키-값 저장소 위의 설정 저장소. `dui.settings.<key>` 키 아래 ["json": String, "t": Double] 사전,
/// 삭제된 항목은 json 없이 ["deleted": true, "t": Double]. 실제 동기화는 CloudKit 구현이 맡고 이것은 테스트용.
public final class KeyValueSettingsSyncRepository: SettingsSyncRepository {
    static let prefix = "dui.settings."
    private let store: KeyValueStore

    public init(store: KeyValueStore) { self.store = store }

    public var isAvailable: Bool { store.isAvailable }

    public func loadAll(refreshTimeout: TimeInterval) throws -> [SyncedSetting] {
        return store.allKeys().compactMap { fullKey -> SyncedSetting? in
            guard fullKey.hasPrefix(Self.prefix), let dict = store.dictionary(forKey: fullKey) else { return nil }
            guard let t = dict["t"] as? Double else { return nil }
            let key = String(fullKey.dropFirst(Self.prefix.count))
            return SyncedSetting(key: key, json: dict["json"] as? String, updatedAt: t)
        }
    }

    public func save(_ items: [SyncedSetting]) throws {
        for item in items {
            var dict: [String: Any] = ["t": item.updatedAt]
            if let json = item.json { dict["json"] = json } else { dict["deleted"] = true }
            store.set(dict, forKey: Self.prefix + item.key)
        }
    }
}
