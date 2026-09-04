import Foundation
import DamoangUICore

/// 확장(JS)과 주고받는 네이티브 메시지 형식.
/// 요청: {"type":"pull","wait":초} | {"type":"push","items":[{"key","json"|null,"t"}]}
/// 응답: {"ok":true,"items":[...]} | {"ok":false,"error":"..."}
enum NativeMessage {
    case pull(wait: TimeInterval)
    case push([SyncedSetting])

    init?(_ raw: Any?) {
        guard let dict = raw as? [String: Any], let type = dict["type"] as? String else { return nil }
        switch type {
        case "pull":
            let wait = min(max((dict["wait"] as? NSNumber)?.doubleValue ?? 0, 0), 5)
            self = .pull(wait: wait)
        case "push":
            let items = (dict["items"] as? [[String: Any]] ?? []).compactMap(NativeMessage.setting(from:))
            self = .push(items)
        default:
            return nil
        }
    }

    private static func setting(from dict: [String: Any]) -> SyncedSetting? {
        guard let key = dict["key"] as? String, !key.isEmpty else { return nil }
        let t = (dict["t"] as? NSNumber)?.doubleValue ?? 0
        let json = dict["json"] as? String
        return SyncedSetting(key: key, json: json, updatedAt: t)
    }

    static func encode(_ items: [SyncedSetting]) -> [String: Any] {
        ["ok": true, "items": items.map { item -> [String: Any] in
            var d: [String: Any] = ["key": item.key, "t": item.updatedAt]
            d["json"] = item.json ?? NSNull()
            return d
        }]
    }

    static func failure(_ message: String) -> [String: Any] {
        ["ok": false, "error": message]
    }
}
