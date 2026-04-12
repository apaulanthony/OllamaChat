/**
 * LlmStudioService.js
 * Responsibility: Handles communication with the LLM via OpenAI API.
 */
import { BaseLlmService } from './BaseLlmService.js';

export class LmStudioService extends BaseLlmService {

    /**
     * @param {Array<Object>} options.messages - The conversation history.
     * @returns {Promise<ReadableStream>}
     * @throws {Error} If the method is not implemented in a subclass.
     */
    async chatStream(messages) {
        const { model, baseUrl, think = false, temperature = null, store = false } = this.getConfig();

        const body = {
            model: model,
            input: messages.map(m => ({ type: "text", content: m.content })),
            stream: true, // Enable streaming
            //think: think || false
            //temperature: temperature
            //store: store
        }

        if (typeof temperature === "number") {
            body.temperature = temperature;
        }

        if (typeof store === "boolean") {
            body.store = store;
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
            throw new Error(`LLM Studio API error: ${response.status} ${errorText}`);
        }

        if (!response.body) {
            throw new Error('Response body is null. Streaming might not be supported by the environment.');
        }

        return new ReadableStream({
            async start(controller) {                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();         
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });                
                                    
                    for (const line of chunk.split('\n')) {
                        //Seperate out the "data" element, then filter furter to only see type "message"
                        const event = line.startsWith("data:") && JSON.parse(line.slice("data:".length).trim() || null);
                        if (event?.type?.startsWith("message.") && event?.content) {
                            controller.enqueue(event.content);
                        }
                    }  
                }

                controller.close()
            }
        });
    }

    async getAllModels() {
        const { baseUrl } = this.getConfig();
        try {
            const response = await fetch(new URL("models", baseUrl));
            if (!response.ok) {
                throw new Error('Failed to fetch models from LLM Studio');
            }
            const data = await response.json();
            return (data.models || []).map(m => ({
                code: m.key,
                description: m.display_name
            }));
        } catch (e) {
            throw e;
        }
    }
}