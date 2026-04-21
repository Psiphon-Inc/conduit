Pod::Spec.new do |s|
  s.name           = 'ExpoPsiphonTunnelCoreModule'
  s.version        = '0.1.0'
  s.summary        = 'Expo module for Android in-proxy station mode (iOS stub)'
  s.description    = 'Cross-platform Expo module that provides Android station foreground service controls. iOS is a no-op stub.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
