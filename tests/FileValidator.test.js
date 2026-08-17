import { describe, it, expect } from 'vitest';
import { isTextFile, isImageFile, isValidFile } from '../src/js/utils/FileValidator';

describe('FileValidator', () => {
    it('should identify common text files', () => {
        const mockFile = { name: 'test.md', type: 'text/markdown' };
        expect(isTextFile(mockFile)).toBe(true);
    });

    it('should identify common image files', () => {
        const mockFile = { name: 'image.png', type: 'image/png' };
        expect(isImageFile(mockFile)).toBe(true);
    });

    it('should return false for unsupported files', () => {
        const mockFile = { name: 'virus.exe', type: 'application/octet-stream' };
        expect(isValidFile(mockFile)).toBe(false);
    });
});