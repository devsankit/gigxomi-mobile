/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const OVERLAY_PERMISSION = 'android.permission.SYSTEM_ALERT_WINDOW';
const TOOLS_NAMESPACE = 'http://schemas.android.com/tools';

function blockOverlayPermission(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return;
  }

  let source = fs.readFileSync(manifestPath, 'utf8');
  if (!source.includes('xmlns:tools=')) {
    source = source.replace(
      /<manifest\b/,
      `<manifest xmlns:tools="${TOOLS_NAMESPACE}"`,
    );
  }

  const permissionPattern =
    /<uses-permission\s+android:name=["']android\.permission\.SYSTEM_ALERT_WINDOW["'][^>]*\/>/g;
  const removalMarker =
    `<uses-permission android:name="${OVERLAY_PERMISSION}" tools:node="remove"/>`;

  if (permissionPattern.test(source)) {
    source = source.replace(permissionPattern, removalMarker);
  } else {
    source = source.replace(/(<manifest\b[^>]*>)/, `$1\n  ${removalMarker}`);
  }

  fs.writeFileSync(manifestPath, source);
}

module.exports = function withoutAndroidOverlay(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const sourceRoot = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
      );

      for (const variant of ['debug', 'debugOptimized']) {
        blockOverlayPermission(
          path.join(sourceRoot, variant, 'AndroidManifest.xml'),
        );
      }

      return modConfig;
    },
  ]);
};
