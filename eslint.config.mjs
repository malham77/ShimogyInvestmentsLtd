import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'js/**/*', 'public/**/*', 'css/**/*', 'assets/**/*']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
