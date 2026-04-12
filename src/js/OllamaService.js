/**
 * OllamaService.js
 * Responsibility: Handles communication with the Ollama LLM API.
*/
import { BaseLlmService } from './BaseLlmService.js';

export class OllamaService extends LlmService {

    /**
     * @param {Array<Object>} messages - The conversation history.
     * @returns {Promise<ReadableStream>}
     * @throws {Error} If the method is not implemented in a subclass.
     */
    async chatStream(messages) {
        const { model, baseUrl, think } = this.getConfig();

        const body = {
            model: model,
            messages: messages,
            stream: true, // Enable streaming
            think: think || false
        }

        const response = await fetch(new URL("chat", baseUrl), {
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

        return new ReadableStream({
            async start(controller) { // Start the stream controller
                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });

                    // llm can send multiple JSON objects in one chunk sometimes
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        const json = line.trim() && JSON.parse(line);
                        if (json?.message?.content) {
                            controller.enqueue(json.message.content);
                        }
                    }
                }
                
                controller.close();            
            }
        });
    }

    async getAllModels() {
        const { baseUrl } = this.getConfig();

        const response = await fetch(new URL("tags", baseUrl));
        if (!response.ok) {
            throw new Error('Failed to fetch models from Ollama');
        }
        const data = await response.json();
        return (data.models || []).map(m => ({
            code: m.model,
            description: m.name || m.model
        }));
    }
}