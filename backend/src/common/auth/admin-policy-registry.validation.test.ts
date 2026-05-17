import { describe, expect, it } from 'vitest';
import { assertAdminPolicyRegistryIntegrity } from './admin-policy-registry.validation';

describe('admin policy registry integrity', () => {
  it('has unique endpoint keys and matching permission layers', () => {
    expect(() => assertAdminPolicyRegistryIntegrity()).not.toThrow();
  });
});
