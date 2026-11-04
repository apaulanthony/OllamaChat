import QRCode from 'qrcode';
import jsQR from 'jsqr';

export class QrCodeService {
    /**
     * Generates a QR code from the provided data.
     * @param {string} data - The content to encode into the QR code.
     * @param {Object} options - Configuration options for generation (e.g., size, margin).
     * @returns {Promise<string>} - A promise that resolves to a Base64 data URL of the QR code.
     */
    async generate(data, options = {}) {    
        try {
            return await QRCode.toDataURL(data, options);
        } catch (error) {
            console.error("QR Code generation failed:", error);
            throw error;
        }
    }

    /**
     * Extracts data from an image/video frame.
     * Used when the user scans a QR code with their camera.
     * @param {HTMLVideoElement|HTMLImageElement} mediaElement
     * @returns {string|Object|null} The parsed data, raw string, or null.
     */
    parse(mediaElement) {
        // Uses 'jsqr' library
        const context = mediaElement.getContext('2d');
        const imageData = context.getImageData(0, 0, mediaElement.videoWidth, mediaElement.videoHeight);

        // Ensure mediaElement is a canvas/video that supports getContext
        if (!context) {
            console.error("mediaElement must be a context-enabled canvas or video element.");
            return null;
        }

        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
            try {
                // If it's a VAPID subscription, it's likely JSON
                return JSON.parse(code.data);
            } catch {
                return code.data;
            }
        }
        return null;
    }
}