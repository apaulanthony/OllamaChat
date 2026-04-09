import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 *  UIController.js
 *  Responsibility: Handles the user interface and interactions
 */
export class UIController {
    constructor() {
        // Speech APIs
        this.recognition = null;
        this.synth = window.speechSynthesis;
        this.isListening = false;

        // Required functions 
        this.getConfig = null;
        this.setConfig = null;

        this.getAllModels = null;
        this.getAllVoices = null;

        this.getComboChatHistoryData = null;
        this.exportData = null;
        this.importData = null;
        this.clearHistory = null;

        this.getChatRecord = null;
        this.setChat = null;

        this.handleSendMessage = null;


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
    }

    init() {
        if (typeof this.getConfig !== 'function') {
            throw Error("UIController.getConfig is not defined. Please define it in your UI");
        }

        if (typeof this.setConfig !== 'function') {
            throw Error("UIController.setConfig is not defined. Please define it in your UI");
        }


        if (typeof this.getAllModels !== 'function') {
            throw Error("UIController.getAllModels is not defined. Please define it in your UI");
        }

        if (typeof this.getAllVoices !== 'function') {
            throw Error("UIController.getAllVoices is not defined. Please define it in your UI");
        }


        if (typeof this.getComboChatHistoryData !== 'function') {
            throw Error("UIController.getComboChatHistoryData is not defined. Please define it in your UI");
        }

        if (typeof this.exportData !== 'function') {
            throw Error("UIController.exportData is not defined. Please define it in your UI");
        }

        if (typeof this.importData !== 'function') {
            throw Error("UIController.importData is not defined. Please define it in your UI");
        }

        if (typeof this.clearHistory !== 'function') {
            throw Error("UIController.clearHistory is not defined. Please define it in your UI");
        }


        if (typeof this.getChatRecord !== 'function') {
            throw Error("UIController.getChatRecord is not defined. Please define it in your UI");
        }

        if (typeof this.setChat !== 'function') {
            throw Error("UIController.setChat is not defined. Please define it in your UI");
        }


        if (typeof this.handleSendMessage !== 'function') {
            throw Error("UIController.handleSendMessage is not defined. Please define it in your UI");
        }



        this.configDialog = document.getElementById('configDialog');
        this.configDialog?.addEventListener("close", () => {
            const config = {
                ...this.getConfig()
            };

            this.configDialog.querySelectorAll('[name="baseUrl"], [name="model"], [name="autoRead"], [name="voice"]').forEach(input => {
                config[input.name] = input.type === "checkbox" ? !!input.checked : input.value;
            })

            this.setConfig(config);
        })

        this.showConfigDialog = document.getElementById('showConfigDialog');
        this.configDialog && this.showConfigDialog?.addEventListener('click', () => {
            this.configDialog.showModal();
            this.initConfigDialog();
        });


        this.historyCombo = document.getElementById('history-combo');
        if (this.historyCombo) {
            this.populateChats()

            this.historyCombo.addEventListener('change', async e => {
                const chat = await this.getChatRecord(+e.target.value) || {};

                this.setChat(chat.id, chat.messages);

                // Swap chat history
                this.chatWindow.innerHTML = '';
                chat.messages?.forEach(message => this.addMessage(message.role, message.content));
            });
        }

        this.clearHistoryBtn = document.getElementById('clear-history-button');
        this.clearHistoryBtn?.addEventListener('click', async () => { if (confirm("Are you sure you want to clear the chat?")) { await this.clearHistory(); this.populateChats(); } });

        this.exportHistoryButton = document.getElementById("export-history-button");
        this.exportHistoryButton?.addEventListener("click", () => this.exportSessionData());

        this.importHistoryFile = document.getElementById("import-history");
        this.importHistoryButton = document.getElementById("import-history-button");
        this.importHistoryButton?.addEventListener("click", async () => { await this.importSessionData(this.importHistoryFile?.files[0]); this.populateChats() });

        this.baseUrlInput = document.getElementById('options-fieldset');
        this.optionsFieldset = document.getElementById('options-fieldset');
        this.optionsCheckbox = document.getElementById('options-checkbox');
        this.optionsContainer = document.getElementById('options-container');
        this.optionsContainer && this.optionsCheckbox?.addEventListener('change', e => {
            this.optionsContainer.style.maxHeight = (e.target.checked ? 'none' : '0px');
        });

        this.baseUrlInput = document.getElementById('baseUrl-input');
        this.modelCombo = document.getElementById('model-combo');
        this.autoReadCheckbox = document.getElementById('auto-read-checkbox');
        this.voiceCombo = document.getElementById('voice-combo');

        this.chatWindow = document.getElementById('chat-window');
        if (this.chatWindow) {
            this.chatWindow.innerHTML = '';
        }

        this.chatInput = document.getElementById('chat-input');
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        this.sendBtn = document.getElementById('send-btn');
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        this.micBtn = document.getElementById('mic-btn');
        this.micBtn.addEventListener('click', () => this.toggleDictation());

        this.renderInitialUI();
    }


    async renderInitialUI() {
        this.addMessage('system', 'Welcome to OllamaChat! Ask me anything.');

        this.initConfigDialog();
    }



    sendMessage() {
        const text = this.chatInput.value.trim();
        this.handleSendMessage(text);
        this.chatInput.value = "";
    }

    async exportSessionData() {
        try {
            const jsonData = await this.exportData();
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `session_backup_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert('Error exporting session data. Please check your browser settings.');
        }
    }

    async importSessionData(file) {
        try {
            if (!file) {
                throw Error("No file selected.");
            }

            const data = await new Promise((resolve, reject) => {
                const reader = new FileReader();

                reader.onerror = () => reject(reader.error);
                reader.onload = () => resolve(reader.result);

                reader.readAsText(file);
            });

            try {
                await this.importData(data);
            } catch (err) {
                reject(new Error('Error parsing JSON file.', { cause: err }));
            }

            alert('Import Successful!');
        } catch (err) {
            console.error(err);
            alert((err && err.message) || "An error occurred while importing the session data.");
        }
    }

    async populateChats(currentChat) {
        const chatCombo = this.historyCombo;
        const chats = await this.getComboChatHistoryData(true);

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

        chatCombo.value = (currentChat || '0');
    }

    async populateModels(currentModel) {
        const modelCombo = this.modelCombo;
        const models = await this.getAllModels();

        modelCombo.length = 0;

        for (const model of models) {
            const option = document.createElement("option");
            option.textContent = model.name;
            modelCombo.add(option);
        }

        this.modelCombo.value = currentModel
    }

    async populateVoices(currentVoice) {
        const voiceCombo = this.voiceCombo;
        const voices = await this.getAllVoices();

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

        voiceCombo.length = 0;

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
                voiceCombo.add(optgroup);
            }
        }

        voiceCombo.value = currentVoice;
    }


    initConfigDialog() {
        const config = this.getConfig();

        //load config into dialog
        const form = this.configDialog?.querySelector("form");
        for (const key in this.config) {
            const input = form?.elements?.namedItem(key);
            if (input) {
                if (input.type === "checkbox") {
                    input.checked = config[key];
                } else {
                    input.value = config[key];
                }
            }
        }

        if (this.modelCombo) {
            this.populateModels(config.model);
            this.modelCombo.addEventListener('change', e => this.setConfig({ model: e.target.value }));
        }

        if (this.autoReadCheckbox) {
            this.autoReadCheckbox.checked = config.autoReadCheckbox;
        }

        if (this.voiceCombo) {
            this.populateVoices(config.voice);
            this.voiceCombo.addEventListener('change', e => this.setConfig({ voice: e.target.value }));
            window.speechSynthesis.onvoiceschanged = () => this.populateVoices(this.getConfig().voice); // In case voices change
        }
    }


    prepareOutput(content) {
        return DOMPurify.sanitize(marked.parse(content))
    }

    scrollToBottom() {
        this.chatWindow.scrollTop = this.chatWindow.scrollHeight;
    }


    updateMessage(element, content, className = null) {
        element.innerHTML = content ? this.prepareOutput(content) : "";
        if (className) {
            element.classList.add(className);
        }
        this.scrollToBottom();
    }

    addMessage(role, text = '') {
        const element = document.createElement('div');
        element.className = `message message-${role}`;

        this.updateMessage(this.chatWindow.appendChild(element), text);

        return element;
    }

    addIndicatorMessage(role) {
        const element = this.addMessage(role, '');

        const indicator = element.appendChild(document.createElement("span"));
        indicator.classList.add("loading-indicator");

        // Randomly assign a "mood" to the loading animation
        const moods = ['lunar', 'dice', ''];
        const randomMood = moods[Math.floor(Math.random() * moods.length)];
        if (randomMood) indicator.classList.add(randomMood);

        return element
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

    // Add Read Aloud button to the completed message
    finishMessage(parentEl) {
        const speakBtn = document.createElement('button');
        speakBtn.innerHTML = '🔊';
        speakBtn.className = 'tts-button';
        speakBtn.title = 'Read aloud';
        speakBtn.onclick = () => this.speakStart(parentEl.textContent);

        const stopBtn = document.createElement('button');
        stopBtn.innerHTML = '⏹️';
        stopBtn.className = 'tts-button';
        stopBtn.title = 'Stop';
        stopBtn.onclick = () => this.speakCancel();


        const div = document.createElement('div');
        div.className = "tts-container";
        div.appendChild(speakBtn);
        div.appendChild(stopBtn);

        parentEl.insertAdjacentElement('afterend', div);

        if (this.getConfig().checked) {
            this.speakBtn.click();
        }
    }


    speakStart(text) {
        // Remove the "🔊" character from text if it's part of the content
        // const cleanText = text.replace('🔊', '').trim();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.synth.getVoices().find((v) => v.name === this.getConfig().voice);
        this.synth.speak(utterance);
    }

    speakCancel() {
        this.synth.cancel();
    }
}