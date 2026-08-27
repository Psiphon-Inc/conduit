module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'react-native-worklets/plugin',
        {
          // SDK 57 / Hermes V1 workaround: compile worklets into the bundle
          // instead of serializing and evaluating each worklet string.
          bundleMode: true,
          strictGlobal: true,
        },
      ],
    ],
  };
};
