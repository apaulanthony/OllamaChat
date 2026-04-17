/**
 * LlmStudioService.js
 * Responsibility: Handles communication with the LLM via OpenAI API.
 */
import { BaseLlmService } from './BaseLlmService.js';

export class LmStudioService extends BaseLlmService {

    /**
     * @param {Array<Object>} options.messages - Current converation up to last (user) message.
     * @param {*} options.response_id - Identifier of existing response to append to
     * @returns {Promise<ReadableStream>}
     * @throws {Error} If the method is not implemented in a subclass.
     */
    async chatStream({ messages, response_id = null }) {
        const { model, baseUrl, think = false, temperature = null, store = false, token = null } = this.getConfig();

        const body = {
            model: model,
            input: messages.map(m => m.images ? { type: "image", data_url: m.images } : { type: "text", content: m.content }),
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

    async getAllModels() {
        const { baseUrl, token = null } = this.getConfig(); // Get the base URL and token from the configuration
        const headers = {};

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(new URL("models", baseUrl), { headers: headers });
        if (!response.ok) {
            throw new Error('Failed to fetch models from LLM Studio');
        }

        const data = await response.json();
        return (data.models || []).map(m => ({
            code: m.key,
            description: m.display_name
        }));
    }
}