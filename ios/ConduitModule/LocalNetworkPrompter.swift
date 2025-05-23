import Foundation
import Network

public class LocalNetworkPrompter {

    @discardableResult
    public static func promptSync(
        timeout: TimeInterval = 30,
        bonjourType: String
    ) -> Bool {

        let sem = DispatchSemaphore(value: 0)
        var granted = false

        // build the browser
        let params = NWParameters(dtls: nil, udp: .init())
        let browser = NWBrowser(
            for: .bonjour(type: bonjourType, domain: nil),
            using: params
        )

        browser.stateUpdateHandler = { newState in
            switch newState {
            case .ready:
                granted = true
                sem.signal()
                browser.cancel()
            case .failed(_):
                sem.signal()
                browser.cancel()
            case .cancelled:
                sem.signal()
            default:
                break
            }
        }

        browser.start(queue: .global())

        let waitResult = sem.wait(timeout: .now() + timeout)
        browser.cancel()

        let result = (waitResult == .success && granted)
        return result
    }
}
