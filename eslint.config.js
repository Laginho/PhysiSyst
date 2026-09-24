import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  ...tseslint.configs.recommended,
  {
    // A value import of the sim barrel pulls Rapier into the entry chunk
    // (PHY-32); only the dynamic import in App.tsx may load it. Tests never
    // reach a bundle. `import { type X }` survives verbatimModuleSyntax as a
    // side-effect import, so only the top-level `import type` is allowed.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/sim/**', 'src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [{
          regex: '(^|/)sim(/(index|simulator))?$',
          allowTypeImports: true,
          message: 'Loads Rapier into the entry chunk. Use `import type`, `sim/timestep`, or the dynamic import in App.tsx.',
        }, {
          regex: '^@dimforge/rapier2d-compat(/|$)',
          message: 'Rapier belongs to src/sim/ only; anything else goes through the sim module.',
        }],
      }],
    },
  },
)
