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
  s.resources = "ios/Resources/**/*"
  # The sealed core loader verifies a newer core's signature with the Security framework.
  s.frameworks = "Security"

  s.dependency 'React-Core'

  # Use the install_modules_dependencies helper for architecture-specific dependencies
  install_modules_dependencies(s)
end