// eslint.config.js（扁平設定，支援 ESLint v9）
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // 先忽略不該掃的資料夾（任何地方的 lib 都忽略）
  {
    ignores: [
      '**/node_modules/**',
      '**/lib/**',
      'public/**',
      '.vscode/**',
      '.config/**',
    ],
  },

  // 官方推薦規則（TypeScript 版，溫和）
  ...tseslint.configs.recommended,

  // 這段讓它找得到 tsconfig（之後要開嚴格型別規則會用到）
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['./functions/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // 先盡量不吵，等 CI 穩定再變嚴
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }
);
