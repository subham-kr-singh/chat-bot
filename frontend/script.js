/**
 * AI Career Mentor Chatbot Frontend Logic
 */

class ChatUI {
    constructor() {
        // DOM Elements
        this.chatArena = document.getElementById('chat-arena');
        this.chatInput = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('send-btn');
        this.clearChatBtn = document.getElementById('clear-chat-btn');
        this.suggestedPrompts = document.getElementById('suggested-prompts');
        this.typingIndicatorTemplate = document.getElementById('typing-indicator-template');
        
        // State
        this.isWaitingForResponse = false;
        
        // Initialize
        this.initEventListeners();
        this.loadHistory();
    }

    async loadHistory() {
        try {
            const response = await fetch('/api/chat/history');
            if (response.ok) {
                const json = await response.json();
                if (json.success && json.data) {
                    const chats = json.data.reverse(); // Backend returns newest first
                    chats.forEach(chat => {
                        if (chat.question) this.appendMessage('user', chat.question);
                        if (chat.answer) this.appendMessage('bot', chat.answer);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }

    initEventListeners() {
        // Auto-expand textarea
        this.chatInput.addEventListener('input', () => this.handleInputExpand());
        
        // Handle keyboard enter
        this.chatInput.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Send button click
        this.sendBtn.addEventListener('click', () => this.handleSend());
        
        // Clear chat click
        this.clearChatBtn.addEventListener('click', () => this.clearChat());
        
        // Suggested prompts click delegation
        this.suggestedPrompts.addEventListener('click', (e) => {
            if (e.target.classList.contains('prompt-pill')) {
                this.chatInput.value = e.target.textContent;
                this.handleSend();
            }
        });
    }

    handleInputExpand() {
        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = `${Math.min(this.chatInput.scrollHeight, 150)}px`;
    }

    resetInput() {
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
    }

    handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSend();
        }
    }

    async handleSend() {
        const text = this.chatInput.value.trim();
        if (!text || this.isWaitingForResponse) return;

        // 1. Render User Message
        this.appendMessage('user', text);
        this.resetInput();

        // 2. Show Typing Indicator
        this.showTypingIndicator();
        this.isWaitingForResponse = true;

        try {
            // 3. Fetch AI Response
            const aiResponse = await this.fetchAIResponse(text);
            
            // 4. Remove Typing Indicator
            this.removeTypingIndicator();
            
            // 5. Render Bot Message
            this.appendMessage('bot', aiResponse);
            
        } catch (error) {
            console.error("Error fetching AI response:", error);
            this.removeTypingIndicator();
            this.appendMessage('bot', "I'm sorry, I'm having trouble connecting to the server right now. Please try again later.");
        } finally {
            this.isWaitingForResponse = false;
        }
    }

    async fetchAIResponse(userMessage) {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: userMessage })
        });
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        
        const json = await response.json();
        if (json.success && json.data && json.data.answer) {
            return json.data.answer;
        }
        
        throw new Error('Invalid response format');
    }

    formatMarkdown(text) {
        // Simple markdown parsing
        // Convert **text** to <strong>text</strong>
        let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Convert \n to <br>
        // Use textContent logic carefully to avoid XSS in real apps
        return formatted;
    }

    appendMessage(sender, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender}-message`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (sender === 'bot') {
            // Apply simple markdown styling for bot
            const lines = text.split('\n');
            lines.forEach((line, index) => {
                if (line.trim() !== '') {
                    const p = document.createElement('p');
                    p.innerHTML = this.formatMarkdown(line); // Using innerHTML here strictly for the formatted bold tags
                    contentDiv.appendChild(p);
                } else if (index !== lines.length - 1 && lines[index+1].trim() !== '') {
                    // Add a br for empty lines if it's not consecutive
                    contentDiv.appendChild(document.createElement('br'));
                }
            });
        } else {
            // Just text content for user to prevent any weird formatting
            contentDiv.textContent = text;
        }

        msgDiv.appendChild(contentDiv);
        this.chatArena.appendChild(msgDiv);
        this.scrollToBottom();
    }

    showTypingIndicator() {
        const clone = this.typingIndicatorTemplate.content.cloneNode(true);
        this.chatArena.appendChild(clone);
        this.scrollToBottom();
    }

    removeTypingIndicator() {
        const indicator = this.chatArena.querySelector('.typing-indicator-wrapper');
        if (indicator) {
            indicator.remove();
        }
    }

    async clearChat() {
        try {
            await fetch('/api/chat/history', { method: 'DELETE' });
        } catch (error) {
            console.error('Error clearing chat history:', error);
        }

        // Keep the first welcome message
        const messages = Array.from(this.chatArena.querySelectorAll('.message'));
        if (messages.length > 1) {
            // Remove all messages except the first one
            for (let i = 1; i < messages.length; i++) {
                messages[i].remove();
            }
        }
    }

    scrollToBottom() {
        this.chatArena.scrollTop = this.chatArena.scrollHeight;
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new ChatUI();
});
