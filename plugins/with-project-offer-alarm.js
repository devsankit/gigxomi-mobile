/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod } = require('@expo/config-plugins');

module.exports = function withProjectOfferAlarm(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const source = path.join(
        modConfig.modRequest.projectRoot,
        'assets',
        'sounds',
        'project_offer_alarm.wav',
      );
      const rawDirectory = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'raw',
      );
      const destination = path.join(rawDirectory, 'project_offer_alarm.wav');

      if (!fs.existsSync(source)) {
        throw new Error(`Missing project offer alarm sound: ${source}`);
      }

      fs.mkdirSync(rawDirectory, { recursive: true });
      fs.copyFileSync(source, destination);
      return modConfig;
    },
  ]);
};
