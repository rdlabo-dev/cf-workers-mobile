// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "WorkersCapacitor",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "WorkersCapacitor", targets: ["WorkersCapacitor"]),
        .library(name: "WorkersIOS", targets: ["WorkersIOS"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(name: "WorkersIOS", dependencies: ["WorkersCapacitor", .product(name: "Capacitor", package: "capacitor-swift-pm"), .product(name: "Cordova", package: "capacitor-swift-pm")], path: "native/ios-host"),
        .target(
            name: "WorkersCapacitor",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "native/ios"
        )
    ]
)
