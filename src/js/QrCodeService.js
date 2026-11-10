import QRCode from 'qrcode';
import {Html5QrcodeScanner} from "html5-qrcode";

export class QrCodeService {
    /**
     * Generates a QR code from the provided data.
     * @param {string} data - The content to encode into the QR code.
     * @param {Object} options - Configuration options for generation (e.g., size, margin).
     * @returns {Promise<string>} - A promise that resolves to a Base64 data URL of the QR code.
     */
    generate(data, options = {}) {    
        try {
            return QRCode.toDataURL(data, options);
        } catch (error) {
            console.error("QR Code generation failed:", error);
            throw error;
        }
    }

    /**
     * Scanning using the camera or selecting an image from the file systema.
     * @param {readerId} ID to div element to render the camera feed.
     * @returns {string|Object|null} The parsed data, raw string, or null.
     */
    async parse(readerId) {        
        return new Promise( (resolve, reject) => {
            const html5QrcodeScanner = new Html5QrcodeScanner(
                readerId,
                { fps: 10, qrbox: {width: 250, height: 250} },
                /* verbose= */ false
            );
    
            const onScanSuccess = (decodedText, decodedResult) => {
                // Stop the scanner immediately to release the camera
                html5QrcodeScanner.clear()
                    .then(() => {
                        resolve(decodedText);
                    })
                    .catch(err => {
                        reject(err);
                    });
            };
    
            // CRITICAL: Do NOT pass 'reject' here. 
            // This fires constantly on frames without QR codes.
            const onScanError = (err) => {
                // Optional: console.warn(`Code scan error = ${err}`);
            };        

            html5QrcodeScanner.render(onScanSuccess, onScanError);
        });
    }
}