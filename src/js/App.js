import packageConfig from '../../package.json';
import { StorageService } from './StorageService.js';
import { OpenAiService } from './OpenAiService.js';
import { UIController } from './UIController.js';

class App {
    constructor() {
        // Load configuration from localStorage or if not found, package.json.
        this.configKey = "config";

        // Initialize config and save it to localStorage
        this.config = {
            ...packageConfig.config,
            ...(JSON.parse(localStorage.getItem(this.configKey) || "{}") || {})
        };

        this.storage = new StorageService();
        this.ui = new UIController();
        this.llm = new OpenAiService(this.configKey.baseUrl);

        this.chat = {
            //id: null,
            messages: [] // Conversation history
        }

        this.init();
    }

    async init() {
        const app = this;

        await this.storage.init();

        this.ui.getConfig = () => app.getConfig();
        this.ui.setConfig = (config) => app.setConfig(config);

        this.ui.onFetchModels = async (callback) => {
            const models = await app.llm.listModels();
            callback?.(models, app.getConfig().model);
        };

        this.ui.onLoadModels = (baseUrl, callback) => {
            app.setConfig({ baseUrl: baseUrl });
            const config = app.getConfig();
            app.llm.setBaseUrl(config.baseUrl);
            app.ui.onFetchModels(callback);
        };

        this.ui.getAllModels = () => app.llm.listModels();

        this.ui.getComboChatHistoryData = (descending = true) => app.storage.getAllDataByDate(descending);
        this.ui.onChatSelected = async (id) => {
            const chat = await app.storage.getRecord(id);
            app.chat = chat;
            app.ui.displayChatHistory(chat);
        };

        this.ui.onExportData = () => app.storage.exportData();
        this.ui.onImportData = (data) => app.storage.importData(data);

        this.ui.onClearHistory = () => app.storage.deleteAllData();

        this.ui.handleSendMessage = (text) => app.handleSendMessage(text);

        this.ui.init();

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

        this.llm.setBaseUrl(this.config.baseUrl);

        localStorage.setItem(this.configKey, JSON.stringify(this.config));
    }

    async handleSendMessage(text) {
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
        chat.sessionName = chat.messages[0].content.substring(0, 30) + '...', // TODO: Get AI to create summary of conversation?       

            // Make sure that falsy id are properly deleted that we can re-use the same
            //(chat.hasOwnProperty('id') && !chat.id) && delete chat.id;
            chat.id = await this.storage.saveRecord(chat);

        // Update UI with User Message
        this.ui.addMessage('user', text, chat.id, chat.messages.length);

        // Update chat history combo box (doesn't matter if we don't wait)
        this.ui.populateChats(chat.id + '');


        // . Preemptively bump the message counter by 1 and create a placeholder for the AI response
        const bubbleId = this.ui.addIndicatorMessage('assistant', chat.id, (chat.messages.length + 1));

        try {
            // 3. Stream from llm
            const stream = await this.llm.chatStream(this.getConfig().model, chat.messages);
            const reader = stream.getReader();
            const decoder = new TextDecoder();

            let fullAiContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });

                // llm can send multiple JSON objects in one chunk sometimes
                const lines = chunk.split('\n');
                for (const line of lines) {
                    const json = line.trim() && JSON.parse(line);
                    if (json?.message?.content) {
                        // Update UI with new chunk (stomping over loading indicator if present)
                        this.ui.updateMessage(bubbleId, fullAiContent += json.message.content);
                    }
                }
            }

            // Satisfy the bumped counter with reponse from LLM
            chat.messages.push({ role: 'assistant', content: fullAiContent });

            await this.storage.saveRecord(chat);

            // 6. Update UI with final message
            this.ui.finishMessage(bubbleId);
        } catch (error) {
            console.error('Chat Error:', error);

            this.ui.updateMessage(bubbleId, 'Error: ' + error.message, 'error');
        }
    }
}

// Initialize the app
const app = new App();