/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'PocketClawWidget',
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.rickray.pocketclaw'],
  },
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit', 'AppIntents'],
});
