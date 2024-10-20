require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = "sherlo-react-native-storybook"
  s.version      = package['version']
  s.summary      = package['description']
  s.license      = package['license']

  s.authors      = package['author']
  s.homepage     = package['homepage']
  s.platform     = :ios, "9.0"

  s.source       = { :git => "https://github.com/sherlo-io/sherlo.git", :tag => "v#{s.version}" }
  s.source_files  = "ios/**/*.{h,m}"
  s.resources = "ios/Resources/**/*"

  s.dependency 'React-Core'
end