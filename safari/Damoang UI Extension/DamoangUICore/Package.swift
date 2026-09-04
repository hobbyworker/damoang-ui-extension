// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DamoangUICore",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "DamoangUICore", targets: ["DamoangUICore"])
    ],
    targets: [
        .target(name: "DamoangUICore", linkerSettings: [.linkedFramework("CloudKit")]),
        .testTarget(name: "DamoangUICoreTests", dependencies: ["DamoangUICore"])
    ]
)
