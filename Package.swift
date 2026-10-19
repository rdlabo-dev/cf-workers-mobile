// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RdlaboWorkersCapacitor",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "RdlaboWorkersCapacitor", targets: ["RdlaboWorkersCapacitor"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "RdlaboWorkersCapacitor",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm")
            ],
            path: "native/ios"
        )
    ]
)
