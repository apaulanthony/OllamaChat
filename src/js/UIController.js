import { marked } from 'marked';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.css';
import renderMathInElement from 'katex/contrib/auto-render';
import mermaid from 'mermaid';

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

        this.getAllEngines = null;
        this.getComboChatHistoryData = null;
        
        this.getAllModels = null;
        
        this.onEngineChange = null
        this.onExportData = null;
        this.onImportData = null;
        this.onClearHistory = null;

        this.onChatSelected = null

        this.handleSendMessage = null;


        // UI Elements
        this.historyCombo = null;
        this.clearHistoryBtn = null;

        this.optionsFieldset = null;
        this.optionsCheckbox = null;
        this.optionsContainer = null;

        this.baseUrlInput = null;
        this.tokenInput = null;
        this.loadModelsButton = null;
        this.engineCombo = null;
        this.modelCombo = null;
        this.chatWindow = null;
        this.chatInput = null;
        this.sendBtn = null;
        this.micBtn = null;
    }

    init() {
        mermaid.initialize({ startOnLoad: false });

        if (typeof this.getConfig !== 'function') {
            throw Error("UIController.getConfig is not defined. Please define it in your UI");
        }

        if (typeof this.setConfig !== 'function') {
            throw Error("UIController.setConfig is not defined. Please define it in your UI");
        }

        if (typeof this.getAllEngines !== "function") {
            throw Error("UIController.getAllEngines is not defined. Please define it in you UI")
        }

        if (typeof this.onEngineChange !== 'function') {
            throw Error("UIController.onEngineChange is not defined. Please define it in your UI");
        }

        if (typeof this.getAllModels !== 'function') {
            throw Error("UIController.getAllModels is not defined. Please define it in your UI");
        }


        if (typeof this.getComboChatHistoryData !== 'function') {
            throw Error("UIController.getComboChatHistoryData is not defined. Please define it in your UI");
        }

        if (typeof this.onChatSelected !== 'function') {
            throw Error("UIController.onChatSelected is not defined. Please define it in your UI");
        }


        if (typeof this.onExportData !== 'function') {
            throw Error("UIController.onExportData is not defined. Please define it in your UI");
        }

        if (typeof this.onImportData !== 'function') {
            throw Error("UIController.onImportData is not defined. Please define it in your UI");
        }

        if (typeof this.onClearHistory !== 'function') {
            throw Error("UIController.onClearHistory is not defined. Please define it in your UI");
        }

        if (typeof this.handleSendMessage !== 'function') {
            throw Error("UIController.handleSendMessage is not defined. Please define it in your UI");
        }


        const getDialogConfig = () => {
            const config = {};

            document.querySelectorAll('#configDialog input[name], #configDialog select[name]').forEach(input => {
                config[input.name] = input.type === "checkbox" ? !!input.checked : input.value;
            });

            return config
        };


        this.configDialog = document.getElementById('configDialog');
        this.configDialog.addEventListener("close", () => this.setConfig(getDialogConfig()));

        this.showConfigDialog = document.getElementById('showConfigDialog');
        this.configDialog && this.showConfigDialog.addEventListener('click', async () => {
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

            //const models = this.getAllModels();
            //this.populateModels(await models, config.model);

            this.configDialog.showModal();
        });


        this.historyCombo = document.getElementById('history-combo');
        if (this.historyCombo) {
            Promise.resolve(this.getComboChatHistoryData(true)).then(data => this.populateChats(data));
            this.historyCombo.addEventListener('change', e => this.onChatSelected?.(+e.target.value));
        }

        this.clearHistoryBtn = document.getElementById('clear-history-button');
        this.clearHistoryBtn.addEventListener('click', async () => { if (this.onClearHistory && confirm("Are you sure you want to clear the chat?")) { await this.onClearHistory(); this.populateChats([]) } });

        this.exportHistoryButton = document.getElementById("export-history-button");
        this.exportHistoryButton.addEventListener("click", async () => this.onExportData && this.exportSessionData(await this.onExportData()));

        this.importHistoryFile = document.getElementById("import-history");
        this.importHistoryButton = document.getElementById("import-history-button");
        this.importHistoryButton.addEventListener("click", async () => {
            const file = this.importHistoryFile.files[0];
            if (!(this.onImportData && file)) return;
            const data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(reader.error);
                reader.onload = () => resolve(reader.result);
                reader.readAsText(file);
            });
            await this.onImportData(data);
            this.populateChats(data)
        });


        // this.optionsFieldset = document.getElementById('options-fieldset');
        // this.optionsCheckbox = document.getElementById('options-checkbox');
        // this.optionsContainer = document.getElementById('options-container');
        // this.optionsContainer && this.optionsCheckbox?.addEventListener('change', e => {
        //     this.optionsContainer.style.maxHeight = (e.target.checked ? 'none' : '0px');
        // });

        this.baseUrlInput = document.getElementById('baseUrl-input');
        this.tokenInput = document.getElementById('token-input');

        this.modelCombo = document.getElementById('model-combo');
        this.modelCombo.addEventListener('change', e => this.setConfig({ model: e.target.value }));

        this.engineCombo = document.getElementById('engine-combo');
        if (this.engineCombo) {
            this.engineCombo.addEventListener('change', e => {this.onEngineChange && this.onEngineChange(e.target.value)});
            Promise.resolve(this.getAllEngines()).then(engines => this.populateEngines(engines, this.getConfig().engine)); 
        }

        this.loadModelsButton = document.getElementById('load-models-button');
        this.loadModelsButton.addEventListener("click",  () => {
            this.setConfig({ baseUrl: this.baseUrlInput.value, token: this.tokenInput.value });
            Promise.resolve(this.getAllModels()).then(models => this.populateModels(models, this.getConfig().model));
        });

        this.voiceCombo = document.getElementById('voice-combo');
        if (this.voiceCombo) {
            this.voiceCombo.addEventListener('change', e => this.setConfig({ voice: e.target.value }));
            this.synth.onvoiceschanged = () => this.populateVoices(this.synth.getVoices(), this.getConfig().voice); // In case voices change            
            Promise.resolve(this.synth.getVoices()).then(voices => this.populateVoices(voices, this.getConfig().voice)); // no need to wait
        }

        this.chatWindow = document.getElementById('chat-window');
        if (this.chatWindow) {
            this.chatWindow.innerHTML = '';
        }

        this.chatInput = document.getElementById('chat-input');
        this.chatInput.addEventListener('keypress', (e) => {
            if (!(e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) && e.key === 'Enter') this.sendMessage();
        });

        this.sendBtn = document.getElementById('send-btn');
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        this.micBtn = document.getElementById('mic-btn');
        this.micBtn.addEventListener('click', () => this.toggleDictation());

        this.setupSpeechRecognition();

        // Use 0 for system chat (invalid as a real chatId) and calculate a message ID based upon a timestamp.
        this.addMessage('system', 'Welcome to OllamaChat! Ask me anything.', 0, Math.floor(Date.now() / 1000));
    }


    sendMessage() {
        const text = this.chatInput.value.trim();
        this.handleSendMessage(text);
        this.chatInput.value = "";
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

    async _populateCombo(element, values = null, currentValue = null) {
        if (values) {
            element.length = 0

            for (const value of values) {
                const option = document.createElement("option");
                option.value = value.code;
                option.textContent = value.description;

                element.add(option);
            }
        }

        element.value = (currentValue || null);
    }  

    async populateEngines(engines = null, currentEngine = null) {
        this._populateCombo(this.engineCombo, engines, currentEngine);
    }    

    async populateChats(chats = null, currentChat = null) {
        const chatCombo = this.historyCombo;

        if (chats) {
            chatCombo.length = 0

            const option = document.createElement("option");
            option.textContent = " - New - "
            option.value = '0';
            chatCombo.add(option);

            for (const chat of chats) {
                const option = document.createElement("option");
                option.value = chat.id.toString();
                option.textContent = `${new Date(chat.date)} ${chat.sessionName}`;

                chatCombo.add(option);
            }
        }

        chatCombo.value = (currentChat || '0');
    }

    async populateModels(models, currentModel = null) {
        this._populateCombo(document.getElementById('model-combo'), models, currentModel);
    }

    displayChatHistory(chat) {
        this.chatWindow.innerHTML = '';

        chat?.messages?.forEach((message, i) => {
            const bubbleId = this.addMessage(message.role, message.content, chat.id, i);
            this.finishMessage(bubbleId);
        });
    }

    async populateVoices(voices = null, currentVoice = null) {
        const voiceCombo = this.voiceCombo;

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
                if (!groupedVoices[group]) continue;

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
        this.chatWindow.scrollTop = this.chatWindow.scrollHeight;
    }


    updateMessage(bubbleId, content, className = null) {
        const element = document.getElementById(bubbleId);
        element.innerHTML = content ? this.prepareOutput(content) : "";

        if (className) {
            element.classList.add(className);
        }

        this.scrollToBottom();
    }

    addMessage(role, text = '', chatId, messageIndex) {
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
        const element = document.getElementById(bubbleId);

        const indicator = element.appendChild(document.createElement("span"));
        indicator.classList.add("loading-indicator");

        // Randomly assign a "mood" to the loading animation
        const moods = ['globe', 'dice', 'lunar', 'weather-1', 'weather-2', 'clocks', ''];
        const randomMood = moods[Math.floor(Math.random() * moods.length)];
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

    /**
     * Perform the heavier rendering manipulations only when the message is complete
     * Append Read Aloud buttons.
     * 
     * @param {*} bubbleId 
     */
    finishMessage(bubbleId) {
        const element = document.getElementById(bubbleId);

        try {
            renderMathInElement(element, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },   // Block math
                    { left: '$', right: '$', display: false },    // Inline math
                    { left: '\\(', right: '\\)', display: false }, // LaTeX inline
                    { left: '\\[', right: '\\]', display: true }  // LaTeX block
                ],
                throwOnError: false // Prevents the whole app from crashing if there's a typo in math
            });
        } catch (err) {
            throw new Error("KaTeX rendering error:", { cause: err });
        }

        try {
            mermaid.run({
                nodes: document.querySelectorAll(`#${bubbleId} .mermaid, #${bubbleId} .language-mermaid`),
                suppressErrors: true
            });
        } catch (err) {
            throw new Error("Mermaid rendering error:", { cause: err });
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

        if (!element.classList.contains("user") &&  this.getConfig().autoRead) {
            this.speakStart(element.textContent);
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