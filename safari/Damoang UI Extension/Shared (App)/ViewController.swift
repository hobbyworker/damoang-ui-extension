import WebKit
import DamoangUICore

#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
typealias PlatformViewController = NSViewController
#endif

/// 안내 페이지(WKWebView)를 띄우고 프레젠터와 페이지 사이를 잇는다.
class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler, ContainerView {

    @IBOutlet var webView: WKWebView!
    private lazy var presenter = AppAssembly.makeContainerPresenter()
    private var pageLoaded = false
    private var pendingState: ContainerPageState?

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.navigationDelegate = self
        webView.configuration.userContentController.add(self, name: "controller")
        webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
        // 앱으로 돌아올 때마다 상태를 다시 읽는다 (창을 닫았다 열어도 앱은 살아 있다)
        #if os(iOS)
        let activated = UIApplication.didBecomeActiveNotification
        #elseif os(macOS)
        let activated = NSApplication.didBecomeActiveNotification
        #endif
        NotificationCenter.default.addObserver(forName: activated, object: nil, queue: .main) { [weak self] _ in
            guard let self, self.pageLoaded else { return }
            self.presenter.refresh()
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageLoaded = true
        if let state = pendingState { render(state) }
        presenter.attach(self)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? String else { return }
        presenter.handle(message: body)
    }

    func render(_ state: ContainerPageState) {
        guard pageLoaded else { pendingState = state; return }
        let enabled = state.extensionEnabled.map { $0 ? "true" : "false" } ?? "null"
        let sync = state.syncStatus
        let last = sync.lastUpdatedAt.map { String(Int($0)) } ?? "null"
        webView.evaluateJavaScript("show('\(state.platform)', \(enabled)); setSyncStatus(\(sync.isAvailable), \(sync.itemCount), \(last))")
    }
}
