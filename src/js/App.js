import packageConfig from '../../package.json';
import { StorageService } from './StorageService.js';
import { OllamaService } from './OllamaService.js';
import { LmStudioService } from './LmStudioService.js';
import { UIController } from './UIController.js';

class App {
    constructor() {
        // Load configuration from localStorage or if not found, package.json.
        this.configKey = "config";

        // Initialise config with defaults from package, then immediately update it with what's stored in localStorage
        this.config = packageConfig.config;
        this.setConfig(JSON.parse(localStorage.getItem(this.configKey) || "{}"));

        this.storage = new StorageService();
        this.ui = new UIController();

        this.llm = this.createLlmEngine(this.config.engine);

        // Initialise chat state with an empty messages array and NO id (its absence prompts indexeddb to create a new one).
        this.chat = {
            //id: null,
            messages: [] // Conversation history
        }

        this.init();
    }


    createLlmEngine(engine) {
        const engines = {
            "OllamaService": OllamaService,
            "LmStudioService": LmStudioService
        };

        if (!engines[engine]) {
            throw new Error(`Unknown engine: ${engine}`);
        }

        return new engines[engine]();
    }


    async init() {
        const app = this;

        this.llm.getConfig = () => this.getConfig();
        await Promise.resolve(this.llm.init());


        await Promise.resolve(this.storage.init());


        this.ui.getConfig = () => app.getConfig();
        this.ui.setConfig = (config) => app.setConfig(config);

        this.ui.getAllEngines = () => [{ code: "LmStudioService", description: "LM Studio" }, { code: "OllamaService", description: "Ollama" }];

        this.ui.onEngineChange = (engine) => {
            app.setConfig({ engine: engine });
            app.llm = app.createLlmEngine(engine);
            app.llm.getConfig = () => app.getConfig();
            return app.llm.init();
        };

        this.ui.getAllModels = async () => app.llm.getAllModels();

        this.ui.getComboChatHistoryData = (descending = true) => app.storage.getAllDataByDate(descending);
        this.ui.onChatSelected = async (id) => {
            const chat = app.chat = await app.storage.getRecord(id);
            chat.messages = chat.messages.filter(m => !!m.content); // Filter empty contents
            app.ui.displayChatHistory(chat);
        };

        this.ui.onExportData = () => app.storage.exportData();
        this.ui.onImportData = (data) => app.storage.importData(data);

        this.ui.onClearHistory = () => app.storage.deleteAllData();

        this.ui.handleSendMessage = (text, files) => app.handleSendMessage(text, files);

        await Promise.resolve(this.ui.init());


        const search = (location.search && new URLSearchParams(location.search)) || null;
        if (search) {
            if ((search.get("clearCache") === "true")) {
                await caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))));
            }
        }
    }


    getConfig() {
        return this.config;
    }

    setConfig(config = {}) {
        this.config = {
            ...this.config,
            ...config
        };

        // Make sure the base URL ends with a slash if it doesn't already
        this.config.baseUrl = this.config.baseUrl.trim();
        if (!this.config.baseUrl.endsWith('/')) {
            this.config.baseUrl += "/";
        }

        localStorage.setItem(this.configKey, JSON.stringify(this.config));
    }


    isTextFile(file) {
        const textMimeTypes = new Set([
            'text/plain',
            'text/markdown',
            'text/html',
            'application/json',
            'application/javascript',
            'application/xml',
            'application/x-python',
            'text/csv'
        ]);

        // 1. The standard check
        if (file.type.startsWith('text/')) return true;

        // 2. The "Application" text exception check
        if (textMimeTypes.has(file.type)) return true;

        // 3. Fallback: Check the extension if the MIME type is missing/generic
        const extension = file.name.split('.').pop().toLowerCase();
        const textExtensions = ['js', 'py', 'md', 'json', 'sql', 'cpp'];
        if (textExtensions.includes(extension)) return true;

        return false;
    }

    isImageFile(file) {
        // 1. The standard MIME check
        if (file.type.startsWith('image/')) return true;

        // 2. Fallback to extension check for "mystery" files
        const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
        const fileExtension = file.name.split('.').pop().toLowerCase();

        return validExtensions.includes(fileExtension);
    }

    async handleSendMessage(text, files = null) {
        if (!text && !files?.length) return;

        const { store, temperature = 0.7 } = this.getConfig();

        // Process attached files. There can be two kinds, text or images, both need to be serialised 
        // to dataUri as as first step. Test can be prefixed into the message as embedded links, images 
        // however have to be sent separately, the precise mechanism left to the LLM engine to implement.
        let textAttachments = ""
        const images = [];

        if (files) {
            await Promise.all(
                files.map(file => {
                    const type = (this.isImageFile(file) && "image") || (this.isTextFile(file) && "text");
                    if (!type) return Promise.resolve(null); // Skip files we don't recognize

                    return new Promise((resolve, reject) => {
                        const fr = new FileReader();
                        fr.onerror = e => reject(e);
                        fr.onloadend = () => resolve({
                            type: type,
                            dataUrl: fr.result,
                            name: file.name
                        });
                        fr.readAsDataURL(file);
                    }).catch(e => {
                        console.error(`Unable to read ${file.name}`, e);
                        return null;
                    })
                })
            ).then(payload => {
                payload.filter(item => !!item).forEach(({ type, dataUrl, name }) => {
                    if (type === "text") {
                        //  Text attachment: Use the Markdown link syntax (AIs like md due to requiring fewer tokens to parse)
                        textAttachments += `[Attachment: ${name}](${dataUrl}) `;
                        //phrase.push({ role: 'user', type: type, content: `[Attachment: ${name}](${dataUrl})` });
                    } else if (type === "image") {
                        // Image attachment: Push as a structured object for indivudal LLM engines to consume in their own manner
                        images.push({ type: type, data_url: dataUrl });
                    }
                });
            }).catch(e => console.error("File ingestion failed", e));
        }


        const chat = this.chat = {
            messages: [],
            temperature: temperature,
            ...this.chat,
        };

        const message = { role: 'user', content: textAttachments + text };
        
        if (images && images.length) {
            message.images = images;
        }

        chat.messages.push(message);

        if (!chat.sessionName) {
            chat.sessionName = message.content.substring(0, 30) + '...'; // TODO: Get AI to create summary of conversation?       
            //Prompt: "Generate a technical 'folding' summary of this chat in under 100 words, focusing on key entities and architectural decisions, so I can use it as context for a future session"
        }

        // Make sure that falsey ids are properly deleted as their absence triggers their generation when saving
        if (chat.hasOwnProperty('id') && !chat.id) {
            delete chat.id;
        }

        chat.id = await this.storage.saveRecord(chat);

        // Update UI with User Message (immediately completing it)
        this.ui.finishMessage(this.ui.addMessage(message.role, message.content, chat.id, chat.messages.length))

        // Update chat history combo box (doesn't matter if we don't wait)
        this.ui.populateChats(await this.storage.getAllDataByDate(true), chat.id + '');

        let fullContent = "";
        const msgId = chat.messages.push({ role: 'assistant', content: fullContent });
        const bubbleId = this.ui.addIndicatorMessage('assistant', chat.id, msgId);

        try {
            // Send history  (excluding last empty prompt) t If using a module that has its own copy of history we only need to send our prompt, if 
            const history = (store && chat.response_id) ? [message] : chat.messages.slice(0, -1);

            const stream = await this.llm.chatStream({ messages: history, response_id: chat.response_id || null });
            const reader = stream.getReader();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                if (value.content) {
                    this.ui.updateMessage(bubbleId, fullContent += value.content);
                }

                // Capture response_id if it's provided by the server
                if (value.result) {
                    chat.response_id = value.result.response_id;
                }
            }

            // Save response to chat history and storage
            chat.messages[msgId - 1].content = fullContent;
            await this.storage.saveRecord(chat);

            // Update UI with final message
            this.ui.finishMessage(bubbleId);
        } catch (error) {
            console.error('Chat Error:', error);

            this.ui.updateMessage(bubbleId, 'Error: ' + error.message, 'error');
        }
    }
}

// Initialize the app
const app = new App();
