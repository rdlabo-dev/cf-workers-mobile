// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "WorkersCapacitor",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "WorkersCapacitor", targets: ["WorkersCapacitor"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "WorkersCapacitor",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm")
            ],
            path: "native/ios"
        )
    ]
)
