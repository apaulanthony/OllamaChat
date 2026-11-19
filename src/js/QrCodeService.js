import { BaseLlmService } from './BaseLlmService.js';

import QRCode from 'qrcode';
import {Html5QrcodeScanner} from "html5-qrcode";

export class QrCodeService extends BaseLlmService {

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
     * @returns {Promise<string|Object|null>} The parsed data, raw string, or null.
     */
    parse(readerId) {        
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

    /**
     * Retrieves all available QR code models. In this case, a simulated "model" that's actually a VAPID subscription to send messages to.
     * @returns {Promise<Array<{code: string, description: string}>>} - A promise that resolves to an array of model objects.
     */
    async getAllModels() {
        const subscription = await this.parse("qr-reader");

        return subscription ? [{
            code: subscription,
            description: "Turing model"
        }] : [];
    }

    /**
     * Sends a chat request to the LLM service and returns a streaming response.
     *
     * @param {Array<Object>} object.messages - The conversation history.
     * @returns {Promise<ReadableStream>} A ReadableStream or async generator for streaming
     * @throws {Error} If the method is not implemented in a subclass.
     */
    async chatStream({messages}) {
        const { model, baseUrl, think = false, temperature = null, store = false, token = null } = this.getConfig();

        const body = {
            model: model,
            input: messages.flatMap(m => [...(m.images ? m.images.map(m2 => { return { type: "image", data_url: m2.data_url } }) : []), { type: "text", content: m.content }]),
            stream: true, // Enable streaming
            //temperature: temperature
            store: store
            //previous_response_id: <response_id>
        }

        if (typeof temperature === "number") {
            body.temperature = temperature;
        }

        // store: false and  previous_response_id : <response_id> are mutually exclusive
        if (store) {
            delete body.store;

            if (response_id) {
                body.previous_response_id = response_id;
            }
        }


        const headers = {
            'Content-Type': 'application/json',
        }

        if (token) {
            headers.Authorization = `Bearer ${token}`
        }

        const response = await fetch(new URL("chat", baseUrl), {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LLM Studio API error: ${response.status} ${errorText}`);
        }

        if (!response.body) {
            throw new Error('Response body is null. Streaming might not be supported by the environment.');
        }

        return new ReadableStream({
            async start(controller) {
                try {
                    const hasIterator = window.Iterator && typeof Iterator.prototype.filter === "function" && typeof Iterator.prototype.map === "function" && typeof Iterator.prototype.forEach === "function";
                    const toIterator = a => hasIterator ? Iterator.from(a) : a;

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });

                        // We can simplify parsing of the stream by all ignoring entries other than those beginning with "data: <JSON event data>"                    
                        toIterator(chunk.split('\n'))
                            .filter(l => l.startsWith("data: "))
                            .map(l => l.slice(("data: ").length).trim())
                            .map(l => {
                                try {
                                    return !!l && JSON.parse(l);
                                } catch (e) {
                                    // Log the failure but continue processing the stream
                                    console.error("Failed to parse JSON payload in chunk:", l, e);
                                    return null;
                                }
                            })
                            .filter(event => !!event)
                            .forEach(event => {
                                // We're interested in payloads that have both a "type":"message.*" and "content":"<blah>"
                                if (event.type === "error") {
                                    throw new Error(`Error in LM Studio: ${event.error}`);
                                }

                                // We're interested in payloads that have both a "type":"message.*" and "content":"<blah>"
                                if (event.type?.startsWith("message.") && event.content) {
                                    controller.enqueue({ content: event.content });
                                }

                                // The response_id is at the end of stream in tyhe "result" block. If found, send the lot back as it may have other interesting stats
                                if (event.type === "chat.end" && event.result) {
                                    controller.enqueue({ result: event.result });
                                }
                            });
                    }
                } catch (error) {
                    console.error("Fatal streaming error encountered and terminated:", { cause: error });
                } finally {
                    // Ensure cleanup always happens
                    controller.close();
                }
            }
        });
    }    
}