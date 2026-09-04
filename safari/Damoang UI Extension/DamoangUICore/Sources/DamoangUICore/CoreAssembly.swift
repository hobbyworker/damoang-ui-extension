import Foundation

/// 조립 지점. 바깥 계층은 여기서 유스케이스를 받아 쓰고 구현체를 직접 알지 않는다.
public enum CoreAssembly {
    /// 앱·확장이 같은 컨테이너를 써야 같은 데이터를 본다. 포털의 iCloud Container 식별자와 같아야 한다
    public static let containerIdentifier = "iCloud.me.hobbyworker.DamoangUIExtension"

    public static func makeRepository() -> SettingsSyncRepository {
        CloudKitSettingsSyncRepository(containerIdentifier: containerIdentifier)
    }
    public static func makePull(repository: SettingsSyncRepository = makeRepository()) -> PullSettingsUseCase {
        DefaultPullSettingsUseCase(repository: repository)
    }
    public static func makePush(repository: SettingsSyncRepository = makeRepository()) -> PushSettingsUseCase {
        DefaultPushSettingsUseCase(repository: repository)
    }
    public static func makeStatus(repository: SettingsSyncRepository = makeRepository()) -> SyncStatusUseCase {
        DefaultSyncStatusUseCase(repository: repository)
    }
}
