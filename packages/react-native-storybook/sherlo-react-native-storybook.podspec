require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = "sherlo-react-native-storybook"
  s.version      = package['version']
  s.summary      = package['description']
  s.license      = package['license']

  s.authors      = package['author']
  s.homepage     = package['homepage']
  s.platform     = :ios, "11.0"

  s.source       = { :git => "https://github.com/sherlo-io/sherlo.git", :tag => "v#{s.version}" }
  s.source_files  = "ios/**/*.{h,m,mm}"
  # The C core's header comes with its vendored xcframework below, not as a source file.
  s.exclude_files = "ios/SherloCore.xcframework/**"
  # CompiledCore.h imports sherlo_core.h, which only this pod's own build can find (see
  # HEADER_SEARCH_PATHS below). Kept private, it stays out of the umbrella header an app built with
  # frameworks compiles.
  s.private_header_files = "ios/CompiledCore.h"
  # Only the module's own header is public. Left to CocoaPods, an app built with use_frameworks! gets
  # every slice's sherlo_core.h copied into this pod's framework Headers, and the build stops on
  # "Multiple commands produce .../Headers/sherlo_core.h".
  s.public_header_files = "ios/SherloModule.h"
  s.resources = "ios/Resources/**/*"
  # The sealed core loader verifies a newer core's signature with the Security framework.
  s.frameworks = "Security"
  # The C core, prebuilt and stripped, laid in by the pack from the pinned core (scripts/packSealedCore.js). Each
  # slice is a dynamic SherloCore.framework, so CocoaPods embeds it in the app as
  # Frameworks/SherloCore.framework, where a check can swap the core without a rebuild. Its one header,
  # sherlo_core.h, is inside each slice's framework; the glue finds it through the device slice.
  s.vendored_frameworks = "ios/SherloCore.xcframework"
  # With use_frameworks! :linkage => :dynamic this pod is a framework of its own, and CocoaPods does
  # not link it against the framework it vendors: the glue names the core itself. A static pod
  # target ignores the flag.
  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => "\"${PODS_TARGET_SRCROOT}/ios/SherloCore.xcframework/ios-arm64/SherloCore.framework/Headers\"",
    "OTHER_LDFLAGS" => "$(inherited) -framework \"SherloCore\""
  }

  s.dependency 'React-Core'

  # Use the install_modules_dependencies helper for architecture-specific dependencies
  install_modules_dependencies(s)
end