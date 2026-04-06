/**
 * OllamaService.js
 * Responsibility: Handles communication with the local Ollama API.
 */
export class OllamaService {
    /**
     * @param {string} host - The host for the Ollama API (e.g., http://localhost:11434)
     */
    constructor(host = "http://localhost:11434") {
        this.host = new URL(host);
    }

    /**
     * Sends a chat request to Ollama and returns a ReadableStream for the response body.
     *
     * @param {string} model - The name of the model to use (e.g., 'llama3')
     * @param {Array<Object>} messages - The conversation history array
     * @returns {Promise<ReadableStream>} - A stream of the response body
     * @throws {Error} If the network request fails or the response is not OK.
     */
    async chatStream(model, messages) {
        const response = await fetch( new URL("api/chat", this.host), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                stream: true // Enable streaming
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error: ${response.status} ${errorText}`);
        }

        if (!response.body) {
            throw new Error('Response body is null. Streaming might not be supported by the environment.');
        }

        return response.body;
    }

    /**
     * Helper method to check if a specific model is available on the local instance.
     *
     * @returns {Promise<Array<object>>} - A list of available model names.
     */
    async listModels() {
        const response = await fetch(new URL("api/tags", this.host));
        if (!response.ok) {
            throw new Error('Failed to fetch models from Ollama');
        }
        const data = await response.json();
        return data.models || [];
    }
}