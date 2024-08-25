module.exports = {
  env: {
    node: true,
    commonjs: true,
    es6: true,
    jest: true,
  },
  extends: 'eslint:recommended',
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  plugins: ['import'],
  rules: {
    'no-unused-vars': [
      'error', // or "warn"
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'no-undef': ['error'],
    // 'no-console': [
    //   'error',
    //   {
    //     allow: ['warn', 'error'],
    //   },
    // ],
    'prefer-const': ['error'],
    'no-var': ['error'],
    'import/no-cycle': 'error',
  },
  ignorePatterns: [''],
}