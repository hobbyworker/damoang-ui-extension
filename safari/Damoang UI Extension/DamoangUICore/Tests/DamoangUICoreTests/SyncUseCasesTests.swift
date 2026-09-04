import XCTest
@testable import DamoangUICore

final class SyncUseCasesTests: XCTestCase {
    private var store: InMemoryKeyValueStore!
    private var repository: SettingsSyncRepository!

    override func setUp() {
        store = InMemoryKeyValueStore()
        repository = KeyValueSettingsSyncRepository(store: store)
    }

    func testPushThenPullRoundTrip() throws {
        let push = DefaultPushSettingsUseCase(repository: repository)
        let pull = DefaultPullSettingsUseCase(repository: repository)
        _ = try push.execute([SyncedSetting(key: "view", json: "{\"cwide\":true}", updatedAt: 100)])
        XCTAssertEqual(try pull.execute(), [SyncedSetting(key: "view", json: "{\"cwide\":true}", updatedAt: 100)])
    }

    func testPushKeepsNewerAndRejectsOlder() throws {
        let push = DefaultPushSettingsUseCase(repository: repository)
        _ = try push.execute([SyncedSetting(key: "member", json: "new", updatedAt: 200)])
        let accepted = try push.execute([SyncedSetting(key: "member", json: "old", updatedAt: 150)])
        XCTAssertTrue(accepted.isEmpty)
        XCTAssertEqual(try repository.loadAll().first?.json, "new")
    }

    func testPushSameTimestampWins() throws {
        let push = DefaultPushSettingsUseCase(repository: repository)
        _ = try push.execute([SyncedSetting(key: "k", json: "a", updatedAt: 5)])
        let accepted = try push.execute([SyncedSetting(key: "k", json: "b", updatedAt: 5)])
        XCTAssertEqual(accepted.count, 1)
        XCTAssertEqual(try repository.loadAll().first?.json, "b")
    }

    func testDeletedItemIsStoredWithoutJson() throws {
        try repository.save([SyncedSetting(key: "qprofile", json: nil, updatedAt: 9)])
        let loaded = try repository.loadAll()
        XCTAssertEqual(loaded.count, 1)
        XCTAssertTrue(loaded[0].isDeleted)
        XCTAssertEqual(store.dictionary(forKey: "dui.settings.qprofile")?["deleted"] as? Bool, true)
    }

    func testStatusCountsLiveItemsOnly() throws {
        try repository.save([
            SyncedSetting(key: "a", json: "1", updatedAt: 1),
            SyncedSetting(key: "b", json: nil, updatedAt: 7)
        ])
        let status = DefaultSyncStatusUseCase(repository: repository).execute()
        XCTAssertEqual(status, SyncStatus(isAvailable: true, itemCount: 1, lastUpdatedAt: 7))
    }

    func testStatusWhenUnavailable() {
        store.isAvailable = false
        let status = DefaultSyncStatusUseCase(repository: repository).execute()
        XCTAssertEqual(status, SyncStatus(isAvailable: false, itemCount: 0, lastUpdatedAt: nil))
    }

    func testIgnoresForeignKeys() throws {
        store.set(["t": 1.0, "json": "x"], forKey: "other.key")
        XCTAssertTrue(try repository.loadAll().isEmpty)
    }
}
