require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

folly_compiler_flags = '-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1 -Wno-comma -Wno-shorten-64-to-32'

Pod::Spec.new do |s|
  s.name         = "sherlo-react-native-storybook"
  s.version      = package['version']
  s.summary      = package['description']
  s.description  = <<-DESC
                  sherlo-react-native-storybook
                   DESC
  s.homepage     = "https://github.com/github_account/sherlo-react-native-storybook"
  s.license      = "MIT"
  s.authors      = { "Your Name" => "yourname@email.com" }
  s.platforms    = { :ios => "10.0" }
  s.source       = { :git => "https://github.com/github_account/sherlo-react-native-storybook.git", :tag => "#{s.version}" }
  
  # Define shared files used by both architectures
  shared_files = [
    "ios/SherloModuleCore.{h,m}", 
    "ios/ExpoUpdateHelper.{h,m}",
    "ios/ConfigHelper.{h,m}",
    "ios/FileSystemHelper.{h,m}",
    "ios/InspectorHelper.{h,m}",
    "ios/StabilityHelper.{h,m}",
    "ios/KeyboardHelper.{h,m}",
    "ios/LastStateHelper.{h,m}",
    "ios/RestartHelper.{h,m}"
  ]

  # Conditionally include files based on architecture
  if ENV['RCT_NEW_ARCH_ENABLED'] == '1'
    # Include TurboModule files for the new architecture
    s.source_files = ["ios/SherloModule.h", 
                     "ios/SherloTurboModule.{h,mm}"] + shared_files
    
    # Specify dependencies when new architecture is enabled
    s.compiler_flags = folly_compiler_flags + " -DRCT_NEW_ARCH_ENABLED=1"
    s.pod_target_xcconfig = {
      "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/boost\" \"$(PODS_ROOT)/boost-for-react-native\" \"$(PODS_ROOT)/RCT-Folly\" \"$(PODS_ROOT)/Headers/Public/React-Codegen/react/renderer/components\" \"$(PODS_ROOT)/Headers/Private/React-Fabric\" \"$(PODS_ROOT)/Headers/Private/React-RCTFabric\" \"$(PODS_ROOT)/Headers/Public/React-Core\" \"$(PODS_ROOT)/Headers/Public/React-cxxreact\" \"$(PODS_ROOT)/Headers/Public/React-callinvoker\" \"$(PODS_ROOT)/Headers/Public/ReactCommon\"",
      "OTHER_CPLUSPLUSFLAGS" => "-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1",
      "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
      "DEFINES_MODULE" => "YES"
    }
    s.dependency "React-Core"
    s.dependency "React"
    s.dependency "React-RCTFabric"
    s.dependency "React-Codegen"
    s.dependency "RCT-Folly"
    s.dependency "ReactCommon/turbomodule/core" 
  else
    # Only include non-TurboModule files for legacy architecture
    s.source_files = ["ios/SherloModule.{h,m}"] + shared_files
    
    # Specify dependencies for legacy architecture
    s.pod_target_xcconfig = {
      "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/Headers/Public/React-Core\"",
      "DEFINES_MODULE" => "YES"
    }
    s.dependency "React-Core"
  end
  
  # Required for UIKit
  s.frameworks = "UIKit"
end