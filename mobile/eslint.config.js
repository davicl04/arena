const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')
module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/**'] },
  {
    // Fontes da web (Inter/Sora): o texto do app passa pelo `Text`/`TextInput` de src/components/Text, que troca o peso pela família.
    files: ['App.tsx', 'src/**/*.{ts,tsx}'],
    ignores: ['src/components/Text.tsx'],
    rules: {
      'no-restricted-imports': ['error', { paths: [{ name: 'react-native', importNames: ['Text', 'TextInput'], message: "Use Text/TextInput de src/components/Text (fontes Inter/Sora)." }] }],
    },
  },
])
