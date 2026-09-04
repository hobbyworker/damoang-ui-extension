import Foundation
import CloudKit

/// CloudKit 비공개 데이터베이스에 설정 항목을 레코드 하나씩 둔다.
/// 레코드 이름 `dui.settings.<key>`, 필드 json(String)·t(Double)·deleted(Int64).
/// 키-값 저장소는 iOS 에서 앱이 살아 있을 때만 값을 내려받아 확장 프로세스가 최신을 못 보므로,
/// 확장이 직접 가져오는 CloudKit 으로 바꿨다 (2026-09-04). 삭제는 레코드를 지우지 않고 deleted 표시로 남긴다.
public final class CloudKitSettingsSyncRepository: SettingsSyncRepository {
    static let recordType = "DuiSetting"
    static let prefix = "dui.settings."

    private let database: CKDatabase
    private let keys: [String]
    private let timeout: TimeInterval

    public init(containerIdentifier: String, keys: [String] = SyncKeys.all, timeout: TimeInterval = 12) {
        self.database = CKContainer(identifier: containerIdentifier).privateCloudDatabase
        self.keys = keys
        self.timeout = timeout
    }

    public var isAvailable: Bool { FileManager.default.ubiquityIdentityToken != nil }

    public func loadAll(refreshTimeout: TimeInterval) throws -> [SyncedSetting] {
        let ids = keys.map { CKRecord.ID(recordName: Self.prefix + $0) }
        let op = CKFetchRecordsOperation(recordIDs: ids)
        op.qualityOfService = .userInitiated
        let lock = NSLock()
        var found: [SyncedSetting] = []
        var failure: Error?
        let done = DispatchSemaphore(value: 0)
        op.perRecordResultBlock = { _, result in
            switch result {
            case .success(let record):
                if let item = Self.setting(from: record) {
                    lock.lock(); found.append(item); lock.unlock()
                }
            case .failure(let error):
                // 아직 만들어진 적 없는 키는 없는 게 정상
                if let ck = error as? CKError, ck.code == .unknownItem { return }
                lock.lock(); failure = error; lock.unlock()
            }
        }
        op.fetchRecordsResultBlock = { result in
            if case .failure(let error) = result {
                let partial = (error as? CKError)?.code == .partialFailure
                lock.lock()
                if !partial && failure == nil { failure = error }
                lock.unlock()
            }
            done.signal()
        }
        database.add(op)
        if done.wait(timeout: .now() + timeout) == .timedOut { throw SyncError.timeout }
        if let failure { throw failure }
        return found
    }

    public func save(_ items: [SyncedSetting]) throws {
        let records = items.map { item -> CKRecord in
            let record = CKRecord(recordType: Self.recordType, recordID: CKRecord.ID(recordName: Self.prefix + item.key))
            record["t"] = item.updatedAt as CKRecordValue
            record["deleted"] = (item.json == nil ? 1 : 0) as CKRecordValue
            if let json = item.json { record["json"] = json as CKRecordValue }
            return record
        }
        let op = CKModifyRecordsOperation(recordsToSave: records, recordIDsToDelete: nil)
        op.savePolicy = .allKeys
        op.qualityOfService = .userInitiated
        var failure: Error?
        let done = DispatchSemaphore(value: 0)
        op.modifyRecordsResultBlock = { result in
            if case .failure(let error) = result { failure = error }
            done.signal()
        }
        database.add(op)
        if done.wait(timeout: .now() + timeout) == .timedOut { throw SyncError.timeout }
        if let failure { throw failure }
    }

    private static func setting(from record: CKRecord) -> SyncedSetting? {
        guard record.recordID.recordName.hasPrefix(prefix), let t = record["t"] as? Double else { return nil }
        let key = String(record.recordID.recordName.dropFirst(prefix.count))
        let deleted = (record["deleted"] as? Int64 ?? 0) != 0
        return SyncedSetting(key: key, json: deleted ? nil : record["json"] as? String, updatedAt: t)
    }
}

public enum SyncError: Error {
    case timeout
}
