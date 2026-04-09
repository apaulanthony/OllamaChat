import packageConfig from '../../package.json';
import { StorageService } from './StorageService.js'; // Note: Fixed typo from StorageService.js
import { OllamaService } from './OllamaService.js';
import { UIController } from './UIController.js';

class App {
    constructor() {
        // Load configuration from localStorage or if not found, package.json.
        this.configKey = "config";
        this.config = null;

        // Initialize config and save it to localStorage
        this.setConfig(this.getConfig());

        this.storage = new StorageService();
        this.ui = new UIController();
        this.ollama = new OllamaService(this.getConfig().baseUrl);
        
        this.currentModel = this.getConfig().model;

        this.chatId = null;
        this.messages = []; // Conversation history

        this.init();
    }

    async init() {
        await this.storage.init();

        this.ui.getConfig = () => this.getConfig();
        this.ui.setConfig = (config) => this.setConfig(config);

        this.ui.getAllModels = () => this.ollama.listModels();
        this.ui.getAllVoices = () => window.speechSynthesis.getVoices();

        this.ui.getComboChatHistoryData = (descending = true) => this.storage.getAllDataByDate(descending);
        this.ui.exportData = () => this.storage.exportData(); 
        this.ui.importData = data => this.storage.importData(data);
        this.ui.clearHistory = () => this.storage.deleteAllData();

        this.ui.setChat = (chatId = null, messages = []) => {
            this.chatId = chatId;
            this.messages = messages;
        };
        this.ui.getChatRecord = (id) => this.storage.getRecord(id);

        this.ui.handleSendMessage = (text) => this.handleSendMessage(text);
        
        this.ui.init()
    
        const search = (location.search && new URLSearchParams(location.search)) || null;
        if (search) {
            if ((search.get("clearCache") === "true")) {
                await caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))));
            }
        }        
    }


    getConfig () {
        return this.config || {
            ...packageConfig.config,
            ...(JSON.parse(localStorage.getItem(this.configKey) || "{}") || {})
        }
    }

    setConfig (config = {}) {
        this.config = {
            ...packageConfig.config,
            ...(this.config || {}),
            ...config
        };

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

        // 1. Update UI and State for User Message
        this.ui.addMessage('user', text);

        const message = { role: 'user' };
        if (text) message.content = text;
        if (images) message.images = images;
        this.messages.push(message);

        // 2. Prepare AI Response UI (Placeholder)        
        const bubbleId = this.ui.addIndicatorMessage('assistant');
        
        try {            
            // 3. Stream from Ollama
            const stream = await this.ollama.chatStream(this.currentModel, this.messages);
            const reader = stream.getReader();
            const decoder = new TextDecoder();

            let fullAiContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });

                // Ollama sends multiple JSON objects in one chunk sometimes
                const lines = chunk.split('\n');
                for (const line of lines) {
                    const json = line.trim() && JSON.parse(line);
                    if (json?.message?.content) {
                        // Update UI with new chunk (stomping over loading indicator if present)
                        this.ui.updateMessage(bubbleId, fullAiContent += json.message.content);
                    }
                }
            }

            // 4. Finalize AI Message in history
            this.messages.push({ role: 'assistant', content: fullAiContent });

            // 5. Persist Chat. Keep id if we already have one
            const chat = Object.assign(this.chatId ? { id: this.chatId } : {}, {
                sessionName: 'Latest Chat',
                messages: this.messages
            });

            this.chatId = await this.storage.saveRecord(chat).then(id => {
                // Update chat history combo box (doesn't matter if we don't wait)
                this.ui.populateChats(id + '');
                return id
            });

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