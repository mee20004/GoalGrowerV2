const appJson = require("./app.json");

module.exports = () => ({
  expo: {
    ...appJson.expo,
    ios: {
      ...appJson.expo.ios,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_PLIST ?? appJson.expo.ios.googleServicesFile,
    },
    android: {
      ...appJson.expo.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? appJson.expo.android.googleServicesFile,
    },
  },
});
