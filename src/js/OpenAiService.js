/**
 * OpenAiService.js
 * Responsibility: Handles communication with the OpenAI compatible LLM API.
 */
export class OpenAiService {
    /**
     * @param {string} baseUrl - The host for the LLM API, e.g. Ollama http://localhost:11434/api, LM Studio http://localhost:1234/v1
     */
    constructor(baseUrl = "http://localhost:11434") {
        this.setBaseUrl(baseUrl);
    }

    setBaseUrl(baseUrl) {
        // Ensure trailing slash in the baseUrl if it's missing or appending relative paths won't work
        this.baseUrl = new URL(baseUrl + (!baseUrl.endsWith("/") ? "/" : ""));
    }

    /**
     * Sends a chat request to Ollama and returns a ReadableStream for the response body.
     *
     * @param {string} model - The name of the model to use (e.g., 'llama3')
     * @param {Array<Object>} messages - The conversation history array
     * @param {number} temperature Optional. Randomness in token selection. 0 is deterministic, higher values increase creativity [0,1].

 
     * @returns {Promise<ReadableStream>} - A stream of the response body
     * @throws {Error} If the network request fails or the response is not OK.
     */
    async chatStream(model, messages, temperature) {
        const body = {
            model: model,
            messages: messages,
            stream: true // Enable streaming
        }

        if (typeof temperature === "number") {
            body.temperature = temperature;
        }

        const response = await fetch(new URL("chat", this.baseUrl), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
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
        const response = await fetch(new URL("tags", this.baseUrl));
        if (!response.ok) {
            throw new Error('Failed to fetch models from Ollama');
        }
        const data = await response.json();
        return data.models || [];
    }
}