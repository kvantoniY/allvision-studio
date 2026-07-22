import {
  CONSENT_DEFINITIONS,
  CONSENT_CURRENT_VERSION,
  CONSENT_TYPES,
  consentTextSnapshot,
  hasAllPhotoConsents,
  requiredConsentTypesForPhotos,
} from '../academy/consents';
import { createChildProfileSchema, updateChildProfileSchema } from '../academy/family';

describe('academy consents', () => {
  it('definitions cover every consent type exactly once', () => {
    expect(CONSENT_DEFINITIONS.map((d) => d.type).sort()).toEqual([...CONSENT_TYPES].sort());
  });

  it('all five consents are required for photos', () => {
    expect(requiredConsentTypesForPhotos()).toHaveLength(5);
  });

  it('hasAllPhotoConsents: true only when every required consent is active', () => {
    const all = CONSENT_TYPES.map((type) => ({ type, version: CONSENT_CURRENT_VERSION, revokedAt: null }));
    expect(hasAllPhotoConsents(all)).toBe(true);
    expect(hasAllPhotoConsents(all.slice(0, 4))).toBe(false);
    expect(hasAllPhotoConsents([])).toBe(false);
  });

  it('hasAllPhotoConsents: revoked consent does not count', () => {
    const withRevoked = CONSENT_TYPES.map((type, i) => ({
      type,
      version: CONSENT_CURRENT_VERSION,
      revokedAt: i === 0 ? new Date().toISOString() : null,
    }));
    expect(hasAllPhotoConsents(withRevoked)).toBe(false);
  });

  it('requires the current text version and produces an immutable snapshot', () => {
    const old = CONSENT_TYPES.map((type) => ({ type, version: 'v1', revokedAt: null }));
    expect(hasAllPhotoConsents(old)).toBe(false);
    expect(consentTextSnapshot('IMAGE_PROCESSING')).toContain(`Редакция: ${CONSENT_CURRENT_VERSION}`);
  });
});

describe('child profile schemas', () => {
  it('accepts a valid child', () => {
    const parsed = createChildProfileSchema.parse({ name: 'Маша', birthDate: '2018-05-10' });
    expect(parsed.name).toBe('Маша');
  });

  it('rejects an adult birth date', () => {
    expect(() => createChildProfileSchema.parse({ name: 'X', birthDate: '1990-01-01' })).toThrow();
  });

  it('rejects a future/too-young birth date', () => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    expect(() =>
      createChildProfileSchema.parse({ name: 'X', birthDate: nextYear.toISOString().slice(0, 10) }),
    ).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => createChildProfileSchema.parse({ name: '  ' })).toThrow();
  });

  it('update allows clearing birthDate with null', () => {
    const parsed = updateChildProfileSchema.parse({ birthDate: null });
    expect(parsed.birthDate).toBeNull();
  });
});
