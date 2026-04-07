import packageConfig from '../../package.json';
import { StorageService } from './StorageService.js'; // Note: Fixed typo from StorageService.js
import { OllamaService } from './OllamaService.js';
import {marked} from 'marked';

class App {
    constructor() {
        // Load configuration from localStorage or if not found, package.json.
        this.configKey = "config";

        this.config = {
            ...packageConfig.config,
            ...JSON.parse(localStorage.getItem(this.configKey) || "{}")
        };

        //Save the config to localStorage for future sessions.        
        localStorage.setItem(this.configKey, JSON.stringify(this.config));

        this.storage = new StorageService();
        this.ollama = new OllamaService(this.config.baseUrl || packageConfig.config.baseUrl);

        this.chatId = null;
        this.messages = []; // Conversation history
        this.currentModel = this.config.model || packageConfig.config.model;


        // Speech APIs
        this.recognition = null;
        this.synth = window.speechSynthesis;
        this.isListening = false;

        // UI Elements
        this.newChatBtn = null;
        this.historyCombo = null;
        this.clearHistoryBtn = null;

        this.baseUrlInput = null;
        this.optionsFieldset = null;
        this.optionsCheckbox = null;
        this.optionsContainer = null;

        this.modelCombo = null;
        this.chatWindow = null;
        this.chatInput = null;
        this.sendBtn = null;
        this.micBtn = null;

        this.init();
    }

    async init() {
        const search = (location.search && new URLSearchParams(location.search)) || null;
        if (search) {
            if ((search.get("clearCache") === "true")) {
                await caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))));
            }
        }

        this.storage.init();
        this.cacheDOM();
        this.setupSpeechRecognition();
        this.attachEventListeners();
        this.renderInitialUI();
    }

    cacheDOM() {
        this.showConfigDialog = document.getElementById('showConfigDialog');
        this.configDialog = document.getElementById('configDialog');

        this.historyCombo = document.getElementById('history-combo');
        this.clearHistoryBtn = document.getElementById('clear-history-button');

        this.baseUrlInput = document.getElementById('options-fieldset');
        this.optionsFieldset = document.getElementById('options-fieldset');
        this.optionsCheckbox = document.getElementById('options-checkbox');
        this.optionsContainer = document.getElementById('options-container');

        this.baseUrlInput = document.getElementById('baseUrl-input');
        this.modelCombo = document.getElementById('model-combo');
        this.autoReadCheckbox = document.getElementById('auto-read-checkbox');
        this.voiceCombo = document.getElementById('voice-combo');

        this.chatWindow = document.getElementById('chat-window');
        this.chatInput = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('send-btn');
        this.micBtn = document.getElementById('mic-btn');
    }

    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                this.chatInput.value = transcript;
                this.isListening = false;
                this.micBtn.textContent = '🎤';
                this.handleSendMessage();
            };

            this.recognition.onerror = (event) => {
                console.error('Speech Recognition Error:', event.error);
                this.isListening = false;
                this.micBtn.textContent = '🎤';
            };

            this.recognition.onend = () => {
                this.isListening = false;
                this.micBtn.textContent = '🎤';
            };
        } else {
            console.warn('Web Speech API (Recognition) not supported in this browser.');
            if (this.micBtn) this.micBtn.style.display = 'none';
        }
    }


    async renderInitialUI() {
        //load config into dialog
        const form = this.configDialog?.querySelector("form");
        for (const key in this.config) {
            const input = form?.elements?.namedItem(key);
            if (input) {
                if (input.type === "checkbox") {
                    input.checked = this.config[key];
                } else {
                    input.value = this.config[key];
                }
            }
        }

        if (this.historyCombo) {
            this.populateChats(this.historyCombo);
        }

        this.chatWindow.innerHTML = '';
        this.addMessageToUI('system', 'Welcome to OllamaChat! Ask me anything.');

        this.initConfigDialog();
    }

    initConfigDialog() {
        this.cacheDOM();

        if (this.modelCombo) {
            this.populateModels(this.modelCombo).then(() => this.modelCombo.value = this.currentModel);
            this.modelCombo?.addEventListener('change', e => this.currentModel = e.target.value);
        }

        if (this.autoReadCheckbox) {
            this.autoReadCheckbox.checked = this.config.autoReadCheckbox;
        }

        if (this.voiceCombo) {
            this.populateVoices(this.voiceCombo);
            window.speechSynthesis.onvoiceschanged = () => this.populateVoices(this.voiceCombo); // In case voices change
            this.voiceCombo.value = this.config.voice
        }
    }

    attachEventListeners() {
        this.showConfigDialog?.addEventListener('click', () => {
            this.configDialog.showModal();
            this.initConfigDialog();
        });

        this.configDialog?.addEventListener("close", e => {
            const config = {
                ...this.config
            };

            this.configDialog.querySelectorAll('[name="baseUrl"], [name="model"], [name="autoRead"], [name="voice"]').forEach(input => {
                config[input.name] = input.type === "checkbox" ? !!input.checked : input.value;
            })

            this.config = config
            localStorage.setItem(this.configKey, JSON.stringify(config));
        })

        this.optionsContainer && this.optionsCheckbox?.addEventListener('change', e => {
            this.optionsContainer.style.maxHeight = (e.target.checked ? 'none' : '0px');
        });

        this.historyCombo?.addEventListener('change', async e => {
            const chat = await this.storage.getRecord(+e.target.value) || {};
            if (chat) {
                this.chatId = chat.id || null;
                this.messages = chat.messages || [];

                // Swap chat history
                this.chatWindow.innerHTML = '';
                this.messages.forEach(message => this.addMessageToUI(message.role, message.content));                                
            }
        });
        this.clearHistoryBtn?.addEventListener('click', () => confirm("Are you sure you want to clear the chat?") && this.storage.deleteAllData());

        this.sendBtn?.addEventListener('click', () => this.handleSendMessage());
        this.chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSendMessage();
        });
        this.micBtn?.addEventListener('click', () => this.toggleDictation());
    }

    async populateChats(chatCombo) {
        const chats = await this.storage.getAllRunsByDate(true);

        chatCombo.length = 0
        
        const option = document.createElement("option");
        option.textContent = " - New - "
        option.value = '0';
        chatCombo.add(option);

        for (const chat of chats) {
            const option = document.createElement("option");
            option.value = chat.id.toString();
            option.textContent = `${new Date(chat.date)} ${chat.messages[0].content}`;

            chatCombo.add(option);
        }
    }

    async populateModels(voiceCombo) {
        const models = await this.ollama.listModels();

        voiceCombo.length = 0;

        for (const model of models) {
            const option = document.createElement("option");
            option.textContent = model.name;
            voiceCombo.add(option);
        }
    }

    async populateVoices(modelCombo) {
        const voices = window.speechSynthesis.getVoices();

        // Sort by language, then name
        voices.sort((a, b) => {
            if (a.lang > b.lang) return 1
            if (a.lang < b.lang) return -1

            if (a.name > b.name) return 1
            if (a.name < b.name) return -1

            return 0
        });

        // Create a map of voices grouped by language for easier access
        const groupedVoices = {};
        voices.forEach(v => (groupedVoices[v.lang] = [...(groupedVoices[v.lang] || []), v]));

        debugger;

        modelCombo.length = 0;

        for (const group in groupedVoices) {
            const optgroup = document.createElement("optgroup");
            optgroup.label = groupedVoices[group][0].lang;            
            
            for (const voice of groupedVoices[group]) {
                const option = document.createElement("option");
                option.textContent = `${voice.name} (${voice.lang})`;
                option.value = voice.name;

                if (voice.default) {
                    option.selected = true;
                    option.textContent += " — DEFAULT";
                }

                optgroup.appendChild(option);
            }

            // Skip adding empty optgroups
            if (optgroup.childElementCount) {
                modelCombo.add(optgroup);
            }
        }
    }

    toggleDictation() {
        if (!this.recognition) return;

        if (this.isListening) {
            this.recognition.stop();
        } else {
            this.isListening = true;
            this.micBtn.textContent = '🛑';
            this.recognition.start();
        }
    }

    async handleSendMessage() {
        const text = this.chatInput.value.trim();
        const images = null;
        //  await Promise.all(this.fileInput?.files.map(file => new Promise((resolve, reject) => {
        //         const fr = new FileReader();
        //         fr.onerror = e => reject(fr.error);
        //         fr.onloadend = () => resolve(fr.result);

        //         fr.readAsDataURL(file);
        //     }).then(s => s.substring(s.indexOf(",") + 1)))) ;            

        // if (!text && !images?.length) return;

        // 1. Update UI and State for User Message
        this.chatInput.value = '';
        this.addMessageToUI('user', text);

        const message = { role: 'user' };
        if (text) message.content = text;
        if (images) message.images = images;
        this.messages.push(message);

        // 2. Prepare AI Response UI (Placeholder)
        const aiMsgDiv = this.addMessageToUI('assistant');
        let indicator = aiMsgDiv.appendChild(document.createElement("span"));
        indicator.classList.add("loading-indicator");

        // Randomly assign a "mood" to the loading animation
        const moods = ['lunar', 'dice', ''];
        const randomMood = moods[Math.floor(Math.random() * moods.length)];
        if (randomMood) indicator.classList.add(randomMood);

        let fullAiContent = '';

        try {
            // 3. Stream from Ollama
            const stream = await this.ollama.chatStream(this.currentModel, this.messages);
            const reader = stream.getReader();
            const decoder = new TextDecoder();

            const writeChunk = (content) => {
                fullAiContent += content;

                if (indicator && fullAiContent) {
                    indicator.remove();
                    indicator = null;
                }

                // Update UI with new chunk
                aiMsgDiv.innerHTML = marked.parse(this.escapeHtml(fullAiContent));

                this.scrollToBottom();
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });

                // Ollama sends multiple JSON objects in one chunk sometimes
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    const json = JSON.parse(line);
                    if (json.message && json.message.content) {
                        writeChunk(json.message.content);
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
                this.populateChats(this.historyCombo).then(() => { this.historyCombo.value = id + ''});
                return id
            });

            // Add Read Aloud button to the completed message
            this.addReadAloudButton(aiMsgDiv, fullAiContent);

        } catch (error) {
            console.error('Chat Error:', error);
            aiMsgDiv.textContent = 'Error: ' + error.message;
            aiMsgDiv.classList.add('error');
        }
    }

    escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    
    scrollToBottom() {
        this.chatWindow.scrollTop = this.chatWindow.scrollHeight;
    }

    addMessageToUI(role, text = '') {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message message-${role}`;
        msgDiv.innerHTML = text ? marked.parse(this.escapeHtml(text)) : '';
        this.chatWindow.appendChild(msgDiv);
        this.scrollToBottom();
        return msgDiv;
    }

    addReadAloudButton(parentEl) {
        const speakBtn = document.createElement('button');
        speakBtn.innerHTML = '🔊';
        speakBtn.className = 'tts-button';
        speakBtn.title = 'Read aloud';
        speakBtn.onclick = () => this.speak(parentEl.textContent);

        const stopBtn = document.createElement('button');
        stopBtn.innerHTML = '⏹️';
        stopBtn.className = 'tts-button';
        stopBtn.title = 'Stop';
        stopBtn.onclick = () => window.speechSynthesis.cancel();

        const div = document.createElement('div');
        div.className = "tts-container";
        div.appendChild(speakBtn);
        div.appendChild(stopBtn);

        parentEl.insertAdjacentElement('afterend', div);

        if (this.autoReadCheckbox.checked) {
            speakBtn.click();
        }
    }

    speak(text) {
        // Remove the "🔊" character from text if it's part of the content
        // const cleanText = text.replace('🔊', '').trim();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.synth.getVoices().find((v) => v.name === this.voiceCombo.value);
        this.synth.speak(utterance);
    }
}

// Initialize the app
const app = new App();