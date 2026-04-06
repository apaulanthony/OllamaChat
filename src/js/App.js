import { StorageService } from './StorageService.js'; // Note: Fixed typo from StorageService.js
import { OllamaService } from './OllamaService.js';
import packageConfig from '../../package.json';

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
        this.ollama = new OllamaService(this.config.host || packageConfig.config.host);
        
        this.messages = []; // Conversation history
        this.currentModel = this.config.model || packageConfig.config.model;
        
        
        // Speech APIs
        this.recognition = null;
        this.synth = window.speechSynthesis;
        this.isListening = false;

        // UI Elements
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

        this.optionsFieldset = document.getElementById('options-fieldset');
        this.optionsCheckbox = document.getElementById('options-checkbox');
        this.optionsContainer = document.getElementById('options-container');

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
        if (form?.elements) {
            for (const key in this.config) {
                const input = form.elements.namedItem(key);
                if (input) {
                    input.value = this.config[key];
                }
            }
        }

        this.chatWindow.innerHTML = '';
        this.addMessageToUI('system', 'Welcome to OllamaChat! Ask me anything.');

        this.initConfigDialog();
    }

    initConfigDialog() {
        this.cacheDOM();

        if (this.modelCombo) {
            this.populateModels(this.modelCombo).then(() => this.modelCombo.value = this.currentModel);         
            this.modelCombo?.addEventListener('change', e  => this.currentModel = e.target.value);
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
            this.configDialog.show();
            this.initConfigDialog();
        });

        this.configDialog?.addEventListener("close", e => {
            const form = configDialog.querySelector("form");            
            localStorage.setItem(this.configKey, JSON.stringify(this.config = {...this.config, ...form.elements}));
        })

        this.optionsContainer && this.optionsCheckbox?.addEventListener('change', e => {
            this.optionsContainer.style.maxHeight = (e.target.checked ? 'none' : '0px');
        });
        
        this.sendBtn?.addEventListener('click', () => this.handleSendMessage());
        this.chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSendMessage();
        });
        this.micBtn?.addEventListener('click', () => this.toggleDictation());
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

        modelCombo.length = 0;

        for (const voice of voices) {
            const option = document.createElement("option");
            option.textContent = `${voice.name} (${voice.lang})`;
            option.value = voice.name;

            if (voice.default) {
                option.selected = true;
                option.textContent += " — DEFAULT";
            }

            modelCombo.add(option);
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
        if (!text) return;

        // 1. Update UI and State for User Message
        this.chatInput.value = '';
        this.addMessageToUI('user', text);
        this.messages.push({ role: 'user', content: text });

        // 2. Prepare AI Response UI (Placeholder)
        const aiMsgDiv = this.addMessageToUI('assistant', '...');
        let fullAiContent = '';

        try {
            // 3. Stream from Ollama
            const stream = await this.ollama.chatStream(this.currentModel, this.messages);
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            
            aiMsgDiv.textContent = ''; // Clear the '...'

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
                        const content = json.message.content;
                        fullAiContent += content;
                        aiMsgDiv.textContent = fullAiContent; // Update UI with new chunk
                        this.chatWindow.scrollTop = this.chatWindow.scrollHeight;
                    }
                }
            }

            // 4. Finalize AI Message in history
            this.messages.push({ role: 'assistant', content: fullAiContent });
            
            // 5. Persist Chat
            await this.storage.saveRecord({
                sessionName: 'Latest Chat',
                messages: this.messages
            });

            // Add Read Aloud button to the completed message
            this.addReadAloudButton(aiMsgDiv, fullAiContent);

        } catch (error) {
            console.error('Chat Error:', error);
            aiMsgDiv.textContent = 'Error: ' + error.message;
            aiMsgDiv.classList.add('error');
        }
    }

    addMessageToUI(role, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message message-${role}`;
        msgDiv.textContent = text;
        this.chatWindow.appendChild(msgDiv);
        this.chatWindow.scrollTop = this.chatWindow.scrollHeight;
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
