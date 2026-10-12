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
  s.resources = "ios/Resources/**/*"
  # The sealed core loader verifies a newer core's signature with the Security framework.
  s.frameworks = "Security"
  # The C core, prebuilt and stripped, laid in by the pack from the pinned core (scripts/packSealedCore.js). Its
  # one header, sherlo_core.h, is inside each slice; the glue finds it through the device slice.
  s.vendored_frameworks = "ios/SherloCore.xcframework"
  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => "\"${PODS_TARGET_SRCROOT}/ios/SherloCore.xcframework/ios-arm64/Headers\""
  }

  s.dependency 'React-Core'

  # Use the install_modules_dependencies helper for architecture-specific dependencies
  install_modules_dependencies(s)
end