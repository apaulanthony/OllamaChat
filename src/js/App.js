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
        this.setConfig(JSON.parse(localStorage.getItem(this.configKey) || "{}") || {});

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
        const llm = ((engine === "OllamaService") && new OllamaService())
            || ((engine === "LmStudioService") && new LmStudioService())
            || null;

        if (!llm) {
            throw new Error(`Unknown engine: ${engine}`);
        }

        return llm;
    }


    async init() {
        const app = this;

        this.llm.getConfig = () => this.getConfig();
        await Promise.resolve(this.llm.init());


        await Promise.resolve(this.storage.init());


        this.ui.getConfig = () => app.getConfig();
        this.ui.setConfig = (config) => app.setConfig(config);

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

        this.ui.handleSendMessage = (text) => app.handleSendMessage(text);

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

    async handleSendMessage(text) {
        if (!text) return;

        const images = null;
        //  await Promise.all(this.fileInput?.files.map(file => new Promise((resolve, reject) => {
        //         const fr = new FileReader();
        //         fr.onerror = e => reject(fr.error);
        //         fr.onloadend = () => resolve(fr.result);

        //         fr.readAsDataURL(file);
        //     }).then(s => s.substring(s.indexOf(",") + 1)))) ;            

        // if (!text && !images?.length) return;

        const message = { role: 'user' };
        if (text) message.content = text;
        if (images) message.images = images;


        const chat = this.chat = {
            messages: [],
            temperature: 0.7,
            ...this.chat,
        };

        chat.messages.push(message);
        chat.sessionName = chat.messages[0].content.substring(0, 30) + '...'; // TODO: Get AI to create summary of conversation?       

        // Make sure that falsey ids are properly deleted that we can re-use the same
        if (chat.hasOwnProperty('id') && !chat.id) {
            delete chat.id;
        }

        chat.id = await this.storage.saveRecord(chat);

        // Update UI with User Message (immedidately completing it)
        this.ui.finishMessage(this.ui.addMessage('user', text, chat.id, chat.messages.length));

        // Update chat history combo box (doesn't matter if we don't wait)
        this.ui.populateChats(await this.storage.getAllDataByDate(true), chat.id + '');


        let fullAiContent = '';

        const msgId = chat.messages.push({ role: 'assistant', content: fullAiContent });
        const bubbleId = this.ui.addIndicatorMessage('assistant', chat.id, msgId);

        try {
            // Stream from llm
            const stream = await this.llm.chatStream(chat.messages.slice(0, -1));
            const reader = stream.getReader();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                this.ui.updateMessage(bubbleId, chat.messages[msgId - 1].content = (fullAiContent += value));
            }

            // Save response to chat history and storage
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