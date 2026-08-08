import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

describe('learner-skeleton', () => {
  const PRE_EXISTING_DEPS = [
    '@supabase/ssr',
    '@supabase/supabase-js',
    'clsx',
    'next',
    'next-intl',
    'react',
    'react-dom',
    'resend',
    'zod',
  ];

  const APPROVED_NEW_DEPS = ['zustand', 'i18next', 'react-i18next', 'posthog-js', 'dexie'];

  it('should have exactly the pre-existing deps plus the five approved deps', () => {
    const packageJsonPath = resolve(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    const allDeps = Object.keys(packageJson.dependencies || {});
    const expectedDeps = [...PRE_EXISTING_DEPS, ...APPROVED_NEW_DEPS];

    // Check that all pre-existing deps are present
    PRE_EXISTING_DEPS.forEach((dep) => {
      expect(allDeps, `Missing pre-existing dep: ${dep}`).toContain(dep);
    });

    // Check that all approved new deps are present
    APPROVED_NEW_DEPS.forEach((dep) => {
      expect(allDeps, `Missing approved dep: ${dep}`).toContain(dep);
    });

    // Check that no unexpected deps were added
    allDeps.forEach((dep) => {
      expect(expectedDeps, `Unexpected dependency: ${dep}`).toContain(dep);
    });

    // Verify exact count
    expect(allDeps.length, `Expected exactly ${expectedDeps.length} dependencies`).toBe(
      expectedDeps.length
    );
  });
});
