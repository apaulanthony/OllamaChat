// vitest.config.js
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom', // Necessary for DOM-related logic like File objects
    }
})