/**
 *  TuringService.js
 *  Responsibility: Handles communication with the "Turing" API - in practise a peer-to-peer chat via WebPush.
 */
import { BaseLlmService } from './BaseLlmService.js';

export class TuringService extends BaseLlmService {
    async connect() {
        const registration = await navigator.serviceWorker.ready;
        // The "Subscription" logic is hidden inside the service!
        this.subscription = await registration.pushManager.getSubscription();

        if (!this.subscription) {
            console.log("No Turing subscription found. Subscribing...");
            this.subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: 'YOUR_VAPID_PUBLIC_KEY'
            });
            // Logic to send this sub to your "Turing" backend
            await this._syncSubscriptionWithBackend(this.subscription);
        }

        this.isConnected = true;
    }

    async disconnect() {
        if (this.subscription) {
            // Clean up the subscription when we switch back to Ollama
            await this.subscription.unsubscribe();
        }
    }

    // ... implement chatStream as a "Waiting for Push" placeholder ...

    async chatStream(messages) {
        // 1. Wait for the Push event to trigger something in your app...
        // 2. Once the message is received via the Service Worker:
        const humanMessage = this.lastReceivedPushMessage;        
        
        return new ReadableStream({
            async start(controller) {
                // 3. Simulate "Tokenization"
                const tokens = humanMessage.split(' '); // Split by word to mimic token chunks

                for (const token of tokens) {
                    controller.enqueue(token + ' ');

                    // A random delay between 50ms and 150ms mimics 
                    // the variable latency of LLM inference/network streaming
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
                }

                controller.close();   
            }
        })
    }


    async getAllModels () {
        // VAPID subscriptions
        return []
    }
}