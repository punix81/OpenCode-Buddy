import tseslint from 'typescript-eslint';

// Local lint gate. The recommended TypeScript set is the baseline; the project
// keeps explicit casts at the boundaries, so `no-explicit-any` stays off while
// real correctness rules (unused bindings, equality, var, prefer-const) apply.
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
);
