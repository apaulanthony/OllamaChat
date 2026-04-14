export class BaseLlmService {

    constructor() {
        /** 
         * Injected by App.js to allow services to access 
         * the global application configuration.
         * @type {Function|null} 
         */
        this.getConfig = null;
        this.isConnected = false;
    }

    init() { }

    // Default: do nothing
    async connect() { 
        this.isConnected = true; 
    }

    // Default: clean up streams/abort controllers
    async disconnect() { 
        this.isConnected = false; 
    }

    /**
     * Sends a chat request to Ollama and returns a ReadableStream for the response body.
     *
     * @param {Array<Object>} object.messages - The conversation history.
     * @param {*} object.response_id - Identifier of existing response to append to
     * @returns {Promise<ReadableStream>} A ReadableStream or async generator for streaming
     * @throws {Error} If the method is not implemented in a subclass.
     */
    async chatStream({messages}) {
        throw new Error("Method 'chatStream()' must be implemented.");
    }


    /**
     * @returns {Promise<Array<{id: string, name: string}>>}
     */
    async getAllModels() {
        throw new Error("Method 'getAllModels()' must be implemented.");
    }
}