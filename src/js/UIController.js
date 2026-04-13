import { marked } from 'marked';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.css';
import renderMathInElement from 'katex/contrib/auto-render';
import mermaid from 'mermaid';

// Define constants for repeated strings
const CONFIG_DIALOG_ID = 'configDialog';
const CHAT_WINDOW_ID = 'chat-window';
const LOADING_MOODS = ['globe', 'dice', 'lunar', 'weather-1', 'weather-2', 'clocks', ''];
const KATEX_DELIMITERS = [
    { left: '$$', right: '$$', display: true },   // Block math
    { left: '$', right: '$', display: false },    // Inline math
    { left: '\\(', right: '\\)', display: false }, // LaTeX inline
    { left: '\\[', right: '\\]', display: true }  // LaTeX block
];

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

        this.getAllModels = null

        this.onEngineChange = null
        this.getComboChatHistoryData = null;
        this.onExportData = null;
        this.onImportData = null;
        this.onClearHistory = null;

        this.onChatSelected = null

        this.handleSendMessage = null;

        // UI Elements
        this.newChatBtn = null;
        this.historyCombo = null;
        this.clearHistoryBtn = null;

        this.baseUrlInput = null;
        this.loadModelsButton = null;
        this.modelCombo = null;
        this.chatWindow = null;
        this.chatInput = null;
        this.sendBtn = null;
        this.micBtn = null;

        // Store event handlers for cleanup
        this._chatInputHandler = null;
        this._sendBtnHandler = null;
        this._micBtnHandler = null;
        this._clearHistoryHandler = null;
        this._exportHistoryHandler = null;
        this._importHistoryHandler = null;
        this._modelComboHandler = null;
        this._engineComboHandler = null;
        this._voiceComboHandler = null;
    }

    /**
     * Validate that a required callback function is defined
     * @param {*} callback - The callback to validate
     * @param {string} name - The name of the callback
     */
    validateCallback(callback, name) {
        if (typeof callback !== 'function') {
            throw new Error(`UIController.${name} is not defined. Please define it in your UI`);
        }
    }

    /**
     * Clean up event listeners and resources to prevent memory leaks
     */
    destroy() {
        // Remove event listeners
        this.chatInput?.removeEventListener('keypress', this._chatInputHandler);
        this.sendBtn?.removeEventListener('click', this._sendBtnHandler);
        this.micBtn?.removeEventListener('click', this._micBtnHandler);
        this.clearHistoryBtn?.removeEventListener('click', this._clearHistoryHandler);
        this.exportHistoryButton?.removeEventListener('click', this._exportHistoryHandler);
        this.importHistoryButton?.removeEventListener('click', this._importHistoryHandler);
        this.modelCombo?.removeEventListener('change', this._modelComboHandler);
        this.engineCombo?.removeEventListener('change', this._engineComboHandler);
        this.voiceCombo?.removeEventListener('change', this._voiceComboHandler);
        
        // Stop speech recognition and synthesis
        this.recognition?.stop();
        this.synth?.cancel();
        
        // Clear synth event handlers
        this.synth.onvoiceschanged = null;
        
        // Clear dialog event handler
        this.configDialog?.removeEventListener("close", this._configDialogCloseHandler);
        this.showConfigDialog?.removeEventListener('click', this._showConfigDialogHandler);
        this.historyCombo?.removeEventListener('change', this._historyComboChangeHandler);
    }

    init() {
        mermaid.initialize({ startOnLoad: false });

        // Validate all required callbacks
        this.validateCallback(this.getConfig, 'getConfig');
        this.validateCallback(this.setConfig, 'setConfig');
        this.validateCallback(this.onEngineChange, 'onEngineChange');
        this.validateCallback(this.getAllModels, 'getAllModels');
        this.validateCallback(this.getComboChatHistoryData, 'getComboChatHistoryData');
        this.validateCallback(this.onChatSelected, 'onChatSelected');
        this.validateCallback(this.onExportData, 'onExportData');
        this.validateCallback(this.onImportData, 'onImportData');
        this.validateCallback(this.onClearHistory, 'onClearHistory');
        this.validateCallback(this.handleSendMessage, 'handleSendMessage');

        const getDialogConfig = () => {
            const config = {};
            document.querySelectorAll('#configDialog input[name], #configDialog select[name]').forEach(input => {
                config[input.name] = input.type === "checkbox" ? !!input.checked : input.value;
            });
            return config;
        };

        this.configDialog = document.getElementById('configDialog');
        if (this.configDialog) {
            this._configDialogCloseHandler = () => this.setConfig(getDialogConfig());
            this.configDialog.addEventListener("close", this._configDialogCloseHandler);
        }

        this.showConfigDialog = document.getElementById('showConfigDialog');
        if (this.configDialog && this.showConfigDialog) {
            this._showConfigDialogHandler = async () => {
                const config = this.getConfig();
                document.querySelectorAll('#configDialog form [name]').forEach(input => {
                    if (config.hasOwnProperty(input.name)) {
                        if (input.type === "checkbox") {
                            input.checked = !!config[input.name]
                        } else {
                            input.value = config[input.name]
                        }
                    }
                })
                this.configDialog.showModal();
            };
            this.showConfigDialog.addEventListener('click', this._showConfigDialogHandler);
        }

        this.historyCombo = document.getElementById('history-combo');
        if (this.historyCombo) {
            Promise.resolve(this.getComboChatHistoryData(true))
                .then(data => this.populateChats(data))
                .catch(err => console.error('Failed to load chat history:', err));
            
            this._historyComboChangeHandler = (e) => this.onChatSelected?.(+e.target.value);
            this.historyCombo.addEventListener('change', this._historyComboChangeHandler);
        }

        this.clearHistoryBtn = document.getElementById('clear-history-button');
        if (this.clearHistoryBtn) {
            this._clearHistoryHandler = async () => {
                if (this.onClearHistory && confirm("Are you sure you want to clear the chat?")) {
                    await this.onClearHistory();
                    this.populateChats(await this.getComboChatHistoryData(true));
                }
            };
            this.clearHistoryBtn.addEventListener('click', this._clearHistoryHandler);
        }

        this.exportHistoryButton = document.getElementById("export-history-button");
        if (this.exportHistoryButton) {
            this._exportHistoryHandler = async () => {
                if (this.onExportData) {
                    this.exportSessionData(await this.onExportData());
                }
            };
            this.exportHistoryButton.addEventListener("click", this._exportHistoryHandler);
        }

        this.importHistoryFile = document.getElementById("import-history");
        this.importHistoryButton = document.getElementById("import-history-button");
        if (this.importHistoryButton) {
            this._importHistoryHandler = async () => {
                const file = this.importHistoryFile?.files[0];
                if (!(this.onImportData && file)) return;
                try {
                    const data = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onerror = () => reject(reader.error);
                        reader.onload = () => resolve(reader.result);
                        reader.readAsText(file);
                    });
                    await this.onImportData(data);
                    this.populateChats(data);
                } catch (err) {
                    console.error('Failed to import chat history:', err);
                    alert('Error importing chat history. Please check the file format.');
                }
            };
            this.importHistoryButton.addEventListener("click", this._importHistoryHandler);
        }

        this.baseUrlInput = document.getElementById('baseUrl-input');

        this.modelCombo = document.getElementById('model-combo');
        if (this.modelCombo) {
            this._modelComboHandler = (e) => this.setConfig({ model: e.target.value });
            this.modelCombo.addEventListener('change', this._modelComboHandler);
        }

        this.engineCombo = document.getElementById('engine-combo');
        if (this.engineCombo) {
            this._engineComboHandler = (e) => {
                if (this.onEngineChange) this.onEngineChange(e.target.value);
            };
            this.engineCombo.addEventListener('change', this._engineComboHandler);
        }

        this.loadModelsButton = document.getElementById('load-models-button');
        if (this.loadModelsButton) {
            this.loadModelsButton.addEventListener("click", async () => {
                if (this.baseUrlInput) {
                    this.setConfig({ baseUrl: this.baseUrlInput.value });
                }
                const models = await this.getAllModels();
                this.populateModels(models, this.getConfig().model);
            });
        }

        this.voiceCombo = document.getElementById('voice-combo');
        if (this.voiceCombo) {
            this._voiceComboHandler = (e) => this.setConfig({ voice: e.target.value });
            this.voiceCombo.addEventListener('change', this._voiceComboHandler);
            this.synth.onvoiceschanged = () => this.populateVoices(this.synth.getVoices(), this.getConfig().voice);
            Promise.resolve(this.synth.getVoices())
                .then(voices => this.populateVoices(voices, this.getConfig().voice))
                .catch(err => console.error('Failed to load voices:', err));
        }

        this.chatWindow = document.getElementById('chat-window');
        if (this.chatWindow) {
            this.chatWindow.innerHTML = '';
        }

        this.chatInput = document.getElementById('chat-input');
        if (this.chatInput) {
            this._chatInputHandler = (e) => {
                if (!(e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) && e.key === 'Enter') {
                    this.sendMessage();
                }
            };
            this.chatInput.addEventListener('keypress', this._chatInputHandler);
        }

        this.sendBtn = document.getElementById('send-btn');
        if (this.sendBtn) {
            this._sendBtnHandler = () => this.sendMessage();
            this.sendBtn.addEventListener('click', this._sendBtnHandler);
        }

        this.micBtn = document.getElementById('mic-btn');
        if (this.micBtn) {
            this._micBtnHandler = () => this.toggleDictation();
            this.micBtn.addEventListener('click', this._micBtnHandler);
        }

        this.setupSpeechRecognition();

        // Use 0 for system chat (invalid as a real chatId) and calculate a message ID based upon a timestamp.
        this.addMessage('system', 'Welcome to OllamaChat! Ask me anything.', 0, Math.floor(Date.now() / 1000));
    }

    sendMessage() {
        const text = this.chatInput?.value?.trim();
        if (text && this.handleSendMessage) {
            this.handleSendMessage(text);
            this.chatInput.value = "";
        }
    }

    async exportSessionData(jsonData) {
        try {
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
                await this.onImportData(data);
            } catch (err) {
                throw new Error('Error parsing JSON file.', { cause: err });
            }

            alert('Import Successful!');
        } catch (err) {
            console.error(err);
            alert((err && err.message) || "An error occurred while importing the session data.");
        }
    }

    async populateChats(chats = null, currentChat = null) {
        const chatCombo = this.historyCombo;
        if (!chatCombo) return;

        if (chats) {
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

        chatCombo.value = (currentChat || '0');
    }

    async populateModels(models, currentModel = null) {
        const modelCombo = document.getElementById('model-combo');
        if (!modelCombo) return;

        if (models) {
            modelCombo.length = 0;

            for (const model of models) {
                const option = document.createElement("option");
                option.value = model.code;
                option.textContent = model.description;
                modelCombo.add(option);
            }
        }

        modelCombo.value = currentModel
    }

    displayChatHistory(chat) {
        if (!this.chatWindow) return;
        this.chatWindow.innerHTML = '';

        chat?.messages?.forEach((message, i) => {
            const bubbleId = this.addMessage(message.role, message.content, chat.id, i);
            this.finishMessage(bubbleId);
        });
    }

    async populateVoices(voices = null, currentVoice = null) {
        const voiceCombo = this.voiceCombo;
        if (!voiceCombo) return;

        if (voices) {
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
        }

        voiceCombo.value = currentVoice;
    }

    prepareOutput(content) {
        return DOMPurify.sanitize(marked.parse(content))
    }

    scrollToBottom() {
        if (this.chatWindow) {
            this.chatWindow.scrollTop = this.chatWindow.scrollHeight;
        }
    }

    updateMessage(bubbleId, content, className = null) {
        const element = document.getElementById(bubbleId);
        if (!element) return;

        element.innerHTML = content ? this.prepareOutput(content) : "";

        if (className) {
            element.classList.add(className);
        }

        this.scrollToBottom();
    }

    addMessage(role, text = '', chatId, messageIndex) {
        if (!this.chatWindow) return null;

        const bubbleId = `chat_${chatId}_msg_${messageIndex}`;
        const element = document.createElement('div');
        element.className = `message message-${role}`;
        element.id = bubbleId;

        this.chatWindow.appendChild(element)

        this.updateMessage(bubbleId, text);

        return bubbleId;
    }

    addIndicatorMessage(role, chatId, messageIndex) {
        const bubbleId = this.addMessage(role, '', chatId, messageIndex);
        if (!bubbleId) return null;

        const element = document.getElementById(bubbleId);
        if (!element) return bubbleId;

        const indicator = element.appendChild(document.createElement("span"));
        indicator.classList.add("loading-indicator");

        // Randomly assign a "mood" to the loading animation
        const randomMood = LOADING_MOODS[Math.floor(Math.random() * LOADING_MOODS.length)];
        if (randomMood) indicator.classList.add(randomMood);

        return bubbleId
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
                if (this.chatInput) {
                    this.chatInput.value = transcript;
                }
                this.isListening = false;
                this.updateMicButton('🎤');
                if (this.handleSendMessage) {
                    this.handleSendMessage(transcript);
                }
            };

            this.recognition.onerror = (event) => {
                console.error('Speech Recognition Error:', event.error);
                this.isListening = false;
                this.updateMicButton('🎤');
            };

            this.recognition.onend = () => {
                this.isListening = false;
                this.updateMicButton('🎤');
            };
        } else {
            console.warn('Web Speech API (Recognition) not supported in this browser.');
            if (this.micBtn) this.micBtn.style.display = 'none';
        }
    }

    updateMicButton(icon) {
        if (this.micBtn) {
            this.micBtn.textContent = icon;
        }
    }

    toggleDictation() {
        if (!this.recognition) return;

        if (this.isListening) {
            this.recognition.stop();
        } else {
            this.isListening = true;
            this.updateMicButton('🛑');
            this.recognition.start();
        }
    }

    /**
     * Perform the heavier rendering manipulations only when the message is complete
     * Append Read Aloud buttons.
     * 
     * @param {*} bubbleId 
     */
    finishMessage(bubbleId) {
        const element = document.getElementById(bubbleId);
        if (!element) return;

        try {
            renderMathInElement(element, {
                delimiters: KATEX_DELIMITERS,
                throwOnError: false // Prevents the whole app from crashing if there's a typo in math
            });
        } catch (err) {
            console.error("KaTeX rendering error:", err);
        }

        try {
            mermaid.run({
                nodes: document.querySelectorAll(`#${bubbleId} .mermaid, #${bubbleId} .language-mermaid`),
                suppressErrors: true
            });
        } catch (err) {
            console.error("Mermaid rendering error:", err);
        }

        const speakBtn = document.createElement('button');
        speakBtn.innerHTML = '🔊';
        speakBtn.className = 'tts-button';
        speakBtn.title = 'Read aloud';
        speakBtn.onclick = () => this.speakStart(element.textContent);

        const stopBtn = document.createElement('button');
        stopBtn.innerHTML = '⏹️';
        stopBtn.className = 'tts-button';
        stopBtn.title = 'Stop';
        stopBtn.onclick = () => this.speakCancel();

        const div = document.createElement('div');
        div.className = "tts-container";
        div.appendChild(speakBtn);
        div.appendChild(stopBtn);

        element.insertAdjacentElement('afterend', div);

        if (this.getConfig().autoRead) {
            this.speakStart(element.textContent);
        }
    }

    speakStart(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = this.synth.getVoices();
        const selectedVoice = this.getConfig().voice;
        if (selectedVoice) {
            utterance.voice = voices.find((v) => v.name === selectedVoice) || voices[0];
        }
        this.synth.speak(utterance);
    }

    speakCancel() {
        this.synth.cancel();
    }
}