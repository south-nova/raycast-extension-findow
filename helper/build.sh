#!/bin/sh
# assets/findow-helper 를 arm64 + x86_64 유니버설 바이너리로 빌드한다. Xcode Command Line Tools 필요.
set -e
cd "$(dirname "$0")"
F="-O -F /System/Library/PrivateFrameworks -framework SkyLight main.swift"
swiftc -target arm64-apple-macos13 $F -o /tmp/findow-helper.arm64
swiftc -target x86_64-apple-macos13 $F -o /tmp/findow-helper.x86_64
lipo -create /tmp/findow-helper.arm64 /tmp/findow-helper.x86_64 -output ../assets/findow-helper
rm /tmp/findow-helper.arm64 /tmp/findow-helper.x86_64
ls -la ../assets/findow-helper
