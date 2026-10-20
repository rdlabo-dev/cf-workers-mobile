import UIKit
import SwiftUI
import WorkersIOS

/// Ordinary UIKit host: no Capacitor superclass, app delegate, configuration,
/// plugin registration, or CLI. Resources belong to this consumer bundle.
@MainActor public func makeEmbeddedController() throws -> WorkersViewController {
    try WorkersViewController(assets: Bundle.module.url(forResource: "PrivateWeb", withExtension: nil)!)
}

@MainActor public struct ConsumerView: View {
    private let controller: WorkersViewController
    public init() throws { controller = try makeEmbeddedController() }
    public var body: some View { WorkersView(controller: controller) }
}
