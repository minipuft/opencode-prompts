export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'plugin',
        'hooks',
        'cli',
        'config',
        'deps',
        'ci',
        'docs',
        'tests',
      ],
    ],
    'scope-empty': [0, 'never'],
    'header-max-length': [2, 'always', 100],
  },
};
