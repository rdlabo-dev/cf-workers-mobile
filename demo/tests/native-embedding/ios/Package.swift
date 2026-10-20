// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "WorkersEmbeddingConsumer",
    platforms: [.iOS(.v15)],
    products: [.library(name: "WorkersEmbeddingConsumer", targets: ["Consumer"])],
    dependencies: [.package(name: "WorkersSDK", path: "../../../..")],
    targets: [.target(name: "Consumer", dependencies: [
        .product(name: "WorkersIOS", package: "WorkersSDK")
    ], resources: [.copy("PrivateWeb")])]
)
