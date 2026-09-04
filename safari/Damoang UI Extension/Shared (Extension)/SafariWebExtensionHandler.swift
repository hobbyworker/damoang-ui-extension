import SafariServices
import os.log
import DamoangUICore

/// 확장이 보낸 네이티브 메시지를 유스케이스로 넘기고 결과를 돌려주는 어댑터.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    private let pull: PullSettingsUseCase = CoreAssembly.makePull()
    private let push: PushSettingsUseCase = CoreAssembly.makePush()

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let raw = request?.userInfo?[SFExtensionMessageKey]

        let reply: [String: Any]
        switch NativeMessage(raw) {
        case .pull(let wait):
            reply = run { NativeMessage.encode(try pull.execute(waitingUpTo: wait)) }
        case .push(let items):
            reply = run { NativeMessage.encode(try push.execute(items)) }
        case nil:
            reply = NativeMessage.failure("unknown message")
        }

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: reply]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    private func run(_ body: () throws -> [String: Any]) -> [String: Any] {
        do {
            return try body()
        } catch {
            os_log(.error, "sync failed: %{public}@", String(describing: error))
            return NativeMessage.failure(String(describing: error))
        }
    }
}
