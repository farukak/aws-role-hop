import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
    developmentIndicator: 'overlay',
  },
  zip: {
    excludeSources: ['coverage/**', '6.2.1_0/**'],
  },
  manifest: ({ browser }) => ({
    name: '__MSG_extensionName__',
    short_name: 'AWS Role Hop',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    permissions: ['storage', 'activeTab'],
    web_accessible_resources: [
      {
        resources: ['aws-console-bridge.js'],
        matches: [
          'https://*.console.aws.amazon.com/*',
          'https://health.aws.amazon.com/*',
          'https://lightsail.aws.amazon.com/*',
          'https://*.console.amazonaws-us-gov.com/*',
          'https://phd.amazonaws-us-gov.com/*',
          'https://*.console.amazonaws.cn/*',
          'https://health.amazonaws.cn/*',
        ],
      },
    ],
    action: {
      default_title: '__MSG_extensionName__',
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Alt+Shift+R',
          mac: 'MacCtrl+Shift+R',
        },
        description: '__MSG_openExtension__',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: '{6eb7fb98-bf3f-4230-9a37-8a6138c418e6}',
              strict_min_version: '142.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
});
