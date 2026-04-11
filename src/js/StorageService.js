/**
 * StorageService.js
 * Responsibility: Stores and retrieves data from local storage
 */
export class StorageService {
    /**
     * Constructor for StorageService class
     * 
     * @param {*} dbName
     * @param {*} defaultObjectStore
     */
    constructor(dbName = __APP_NAME__, defaultObjectStore = 'session') {
        this.name = dbName;
        this.defaultObjectStore = defaultObjectStore;

        // Convert the sematic version number from package.json to a 32-bit integer
        this.version = this.convertVersionToInt32(__APP_VERSION__);
        this.db = this.openDB();
    }

    async init() {
        // Ensure the promise is resolved before proceeding        
        await this.db;
    }


    /**
     * Convert a sematic versioning string into an 32-bit integer.
     * 
     * Make sure the input string is compatible with the standard found
     * at semver.org. Since this only uses 10-bit per major/minor/patch version,
     * the highest possible SemVer string would be 1023.1023.1023.
     * @param  {string} version SemVer string
     * @return {number}         Numeric version
     */
    convertVersionToInt32(version) {
        // Split a given version string into three parts.
        const parts = version.split('.');

        // Check if we got exactly three parts, otherwise throw an error.
        if (parts.length !== 3) {
            throw new Error('Received invalid version string');
        }

        // 1. Map the strings to numbers and validate them.
        // 2. Reverse them so index 0 = Patch, 1 = Minor, 2 = Major.        
        const numericParts = parts.map(part => {
            const val = parseInt(part, 10);

            if (isNaN(val) || val >= 1024) {
                throw new Error(`Invalid version component: ${part}`);
            }

            return val;
        }).reverse();

        // Shift all parts either 0, 10 or 20 bits to the left, then combine them using reduce()
        return numericParts.reduce((acc, val, i) => {
            return acc | (val << (i * 10));
        }, 0);
    }


    async _executeRequest(storeName, operation, mode = 'readonly') {
        const db = await this.db;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], mode);
            transaction.onerror = (event) => reject(event.target.error);

            const request = operation(transaction.objectStore(storeName));
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * Open (or create) the IndexedDB database and object store for runs
     * 
     * @returns {Promise<IDBDatabase>}
     */
    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const transaction = event.target.transaction;
                const storeName = this.defaultObjectStore;

                const runsStore = db.objectStoreNames.contains(storeName)
                    ? transaction.objectStore(storeName)
                    : db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });

                if (!runsStore.indexNames.contains('date')) {
                    runsStore.createIndex('date', 'date', { unique: false });
                }
            };

            request.onerror = (event) => reject(event.target.error);
            request.onsuccess = (event) => resolve(event.target.result);
        });
    }


    /**
     * Save a run to IndexedDB, returning a promise that resolves to the ID of the saved run
     * 
     * @param {object} run 
     * @returns 
     */
    async saveRecord(data, name = this.defaultObjectStore) {
        return this._executeRequest(name, (store) =>
            store.put({ ...data, date: Date.now() }), 'readwrite'
        );
    }

    /**
     * Get a run by ID from IndexedDB
     * 
     * @param {number} id 
     * @returns {Promise<object>} 
     */
    async getRecord(id, name = this.defaultObjectStore) {
        return this._executeRequest(name, (store) => store.get(id));
    }

    /**
     * Delete a run by ID from IndexedDB
     * 
     * @param {BigInteger} id 
     * @returns {Promise<void>} resolves when the operation is complete
     */
    async deleteRecord(id, name = this.defaultObjectStore) {
        return this._executeRequest(name, store => store.delete(id), 'readwrite');
    }

    /**
     * Get all runs from IndexedDB, returning a promise that resolves to an array of run objects
     * 
     * @returns {Promise<Array<object>>} 
     */
    async getAllData(name = this.defaultObjectStore) {
        return this._executeRequest(name, store => store.getAll());
    }


    /**
     * Get all data from IndexedDB, sorted by date. 
     * 
     * https://developer.mozilla.org/en-US/docs/Web/API/IDBIndex/getAll#browser_compatibility
     *
     * FF doesn't support "parameter by object", so no native "direction". Fortunately we're getting
     * the whole set so the solution is simple; Array.reverse() (It would be fiddlier if data
     * were fetched in pages to calculate offsets and then fetching the pages in reverse order).
     * 
     * @param {boolean} descending
     * @returns {Promise<Array<object>>}
     */
    async getAllDataByDate(descending, name = this.defaultObjectStore) {
        const db = await this.db;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(name);
            transaction.onerror = event => reject(event.target.error);

            // Get all data from the objectstore via the "date" index
            const request = transaction.objectStore(name).index('date').getAll();
            request.onsuccess = event => {
                const data = event.target.result;
                resolve(descending ? data.reverse() : data)
            };
        });
    }


    /**
     * Clear all runs from IndexedDB, returning a promise that resolves when the operation is complete
     * 
     * @returns {Promise<array<void>>} 
     */
    async deleteAllData(name = this.defaultObjectStore) {
        return this._executeRequest(name, store => store.clear(), "readwrite");
    }


    /**
     * Exports all data from a specific object store as a JSON string.
     * 
     * @param {string} name 
     * @returns {Promise<string>} JSON string of all records
     */
    async exportData(name = this.defaultObjectStore) {
        const data = await this.getAllData(name);

        return JSON.stringify(data);
    }

    /**
     * Imports data from a JSON string into a specific object store.
     * 
     * @param {string} jsonString 
     * @param {string} name 
     * @returns {Promise<void>}
     */
    async importData(jsonString, name = this.defaultObjectStore) {
        const data = JSON.parse(jsonString);
        if (!Array.isArray(data)) throw new Error("Import data must be an array");

        return this._executeRequest(name, store => {
            data.forEach(record => {
                // We use put() to ensure that if an ID already exists, it is updated
                // rather than creating duplicates, maintaining integrity.
                // Ignore the IDBRequest return value - use parent transaction to catch
                // any errors and return the promise when done.
                store.put({ date: Date.now(), ...record });
            });
        }, "readwrite");
    }
}