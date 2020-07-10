module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.eslint.json',
  },
  plugins: ['@typescript-eslint'],
  extends: ['standard-with-typescript', 'prettier/@typescript-eslint'],
  rules: {
    'comma-dangle': ['error', 'always-multiline'],
    semi: ['error', 'always'],
    '@typescript-eslint/return-await': ['error', 'in-try-catch'],
    '@typescript-eslint/strict-boolean-expressions': ['off'],
  },
};
