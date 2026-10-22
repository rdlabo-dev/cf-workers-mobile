// swift-tools-version: 5.9
import PackageDescription
import Foundation
let sdkDependency: Package.Dependency
if let revision = ProcessInfo.processInfo.environment["WORKERS_SWIFT_REVISION"] {
    sdkDependency = .package(name: "WorkersSDK", url: "https://github.com/rdlabo-dev/cf-workers-native.git", revision: revision)
} else {
    sdkDependency = .package(name: "WorkersSDK", path: "../../../..")
}
let package = Package(
    name: "WorkersEmbeddingConsumer",
    platforms: [.iOS(.v15)],
    products: [.library(name: "WorkersEmbeddingConsumer", targets: ["Consumer"])],
    dependencies: [sdkDependency],
    targets: [.target(name: "Consumer", dependencies: [
        .product(name: "WorkersIOS", package: "WorkersSDK")
    ], resources: [.copy("PrivateWeb")])]
)
