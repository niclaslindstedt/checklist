# The local Expo module behind the Home Screen widgets (see ../index.ts).
# Autolinked from ../expo-module.config.json — there is no npm package here.

Pod::Spec.new do |s|
  s.name           = 'WidgetBridge'
  s.version        = '1.0.0'
  s.summary        = 'Publishes the checklist widget snapshot to the App Group'
  s.description    = 'Writes the derived widget snapshot into the shared App Group container, reloads the WidgetKit timelines, and drains the actions the interactive widget queues.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  # App Intents (the interactive check-off) need iOS 17, but the module itself
  # only needs WidgetKit; 15.1 matches the app so the read-only widgets work
  # lower down.
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
