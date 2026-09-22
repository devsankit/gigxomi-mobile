/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const { withAppBuildGradle, withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const dependency = 'implementation("com.android.installreferrer:installreferrer:2.2")';
function patchGradle(contents) {
  if (contents.includes('com.android.installreferrer:installreferrer:')) return contents;
  if (!/dependencies\s*\{/.test(contents)) throw Error('Install Referrer: dependencies block not found');
  return contents.replace(/dependencies\s*\{/, `dependencies {\n    ${dependency}`);
}
function patchApplication(contents) {
  if (contents.includes('add(GigxomiInstallReferrerPackage())')) return contents;
  if (!/PackageList\(this\)\.packages\.apply\s*\{/.test(contents)) throw Error('Install Referrer: Kotlin package registration not found');
  return contents.replace(/PackageList\(this\)\.packages\.apply\s*\{/, '$&\n              add(GigxomiInstallReferrerPackage())');
}
function copySources(projectRoot, platformRoot, applicationId) {
  const destination = path.join(platformRoot, 'app/src/main/java', applicationId.replaceAll('.', '/'));
  fs.mkdirSync(destination, { recursive: true });
  for (const filename of ['GigxomiInstallReferrerModule.kt', 'GigxomiInstallReferrerPackage.kt']) {
    const source = fs.readFileSync(path.join(projectRoot, 'plugins/install-referrer', filename), 'utf8');
    fs.writeFileSync(path.join(destination, filename), source.replace('package com.gigxomi.app', `package ${applicationId}`));
  }
}
function withInstallReferrer(config) {
  config = withAppBuildGradle(config, mod => { mod.modResults.contents = patchGradle(mod.modResults.contents); return mod; });
  config = withMainApplication(config, mod => { mod.modResults.contents = patchApplication(mod.modResults.contents); return mod; });
  return withDangerousMod(config, ['android', async mod => {
    copySources(mod.modRequest.projectRoot, mod.modRequest.platformProjectRoot, mod.android.package);
    return mod;
  }]);
}
module.exports = withInstallReferrer;
module.exports.patchGradle = patchGradle;
module.exports.patchApplication = patchApplication;
module.exports.copySources = copySources;
