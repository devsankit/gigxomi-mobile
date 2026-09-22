const { withProjectBuildGradle } = require('expo/config-plugins');

const NOTIFEE_MAVEN_REPOSITORY =
  '    maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }';

module.exports = function withNotifeeMavenRepository(config) {
  return withProjectBuildGradle(config, (projectConfig) => {
    if (projectConfig.modResults.language !== 'groovy') {
      throw new Error('Gigxomi requires a Groovy Android project build file.');
    }

    const contents = projectConfig.modResults.contents;
    if (contents.includes('@notifee/react-native/android/libs')) {
      return projectConfig;
    }

    const repositoriesBlock = /allprojects\s*\{\s*repositories\s*\{/;
    if (!repositoriesBlock.test(contents)) {
      throw new Error('Unable to locate the Android allprojects repositories block.');
    }

    projectConfig.modResults.contents = contents.replace(
      repositoriesBlock,
      (match) => `${match}\n${NOTIFEE_MAVEN_REPOSITORY}`,
    );

    return projectConfig;
  });
};
