import { describe, expect, it } from 'vitest';
import { AppError } from '@common/errors/app-error';
import { PRODUCT_IMAGE_MAX_BYTES } from './product-media.constants';
import { assertProductImageUpload, detectProductImageMime } from './product-media.validation';

describe('product image validation', () => {
  it('detects JPEG magic bytes', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectProductImageMime(buffer)).toBe('image/jpeg');
  });

  it('rejects files larger than 5 MiB', () => {
    const buffer = Buffer.alloc(PRODUCT_IMAGE_MAX_BYTES + 1, 0xff);
    buffer[0] = 0xff;
    buffer[1] = 0xd8;
    buffer[2] = 0xff;
    expect(() => assertProductImageUpload({ buffer })).toThrow(AppError);
  });

  it('rejects mismatched declared MIME', () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(() =>
      assertProductImageUpload({ buffer, declaredMime: 'image/jpeg' })
    ).toThrow(AppError);
  });
});
