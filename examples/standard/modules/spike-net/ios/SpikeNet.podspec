Pod::Spec.new do |s|
  s.name           = 'SpikeNet'
  s.version        = '0.1.0'
  s.summary        = 'Spike release-connection: native WebSocket clients'
  s.description    = 'Spike release-connection: native WebSocket clients'
  s.license        = 'MIT'
  s.author         = 'sherlo'
  s.homepage       = 'https://sherlo.io'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/expo/expo.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
