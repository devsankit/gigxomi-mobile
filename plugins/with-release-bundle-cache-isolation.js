/* eslint-disable @typescript-eslint/no-require-imports */
const { withAppBuildGradle } = require('@expo/config-plugins');

const resetCacheConfiguration = 'extraPackagerArgs = ["--reset-cache"]';

function patchGradle(contents) {
  if (contents.includes(resetCacheConfiguration)) return contents;
  if (!/react\s*\{/.test(contents)) {
    throw Error('Release bundle cache isolation: React Gradle block not found');
  }

  return contents.replace(/react\s*\{/, `$&\n    // Distribution flags change the embedded JS. Never reuse a Direct/Reader transform cache.\n    ${resetCacheConfiguration}`);
}

function withReleaseBundleCacheIsolation(config) {
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = patchGradle(mod.modResults.contents);
    return mod;
  });
}

module.exports = withReleaseBundleCacheIsolation;
module.exports.patchGradle = patchGradle;

