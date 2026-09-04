import Foundation

/// 키-값 저장소 추상화. 지금은 테스트용 인메모리 저장소와 그 위의 저장소 구현에만 쓴다.
/// (iCloud 키-값 저장소는 iOS 에서 앱이 살아 있어야 값을 받아 CloudKit 으로 바꿨다, 2026-09-04)
public protocol KeyValueStore {
    var isAvailable: Bool { get }
    func dictionary(forKey key: String) -> [String: Any]?
    func set(_ value: [String: Any]?, forKey key: String)
    func allKeys() -> [String]
}

public final class InMemoryKeyValueStore: KeyValueStore {
    public var isAvailable = true
    private var storage: [String: [String: Any]] = [:]
    public init() {}
    public func dictionary(forKey key: String) -> [String: Any]? { storage[key] }
    public func set(_ value: [String: Any]?, forKey key: String) {
        if let value { storage[key] = value } else { storage.removeValue(forKey: key) }
    }
    public func allKeys() -> [String] { Array(storage.keys) }
}
