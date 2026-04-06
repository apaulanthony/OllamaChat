/**
 * StorageService.js
 * Responsibility: Stores and retrieves data from local storage
 */
export class StorageService {
    constructor(name = __APP_NAME__) {
        this.name = name;
        this.defaultObjectStoreName = 'session'
    }

    init() {
        // Convert the sematic version number from package.json to a 32-bit integer
        this.version = this.convertVersionToInt32(__APP_VERSION__);
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
        let parts = version.split('.');

        // Check if we got exactly three parts, otherwise throw an error.
        if (parts.length !== 3) {
            throw new Error('Received invalid version string');
        }

        // Make sure that no part is larger than 1023 or else it
        // won't fit into a 32-bit integer.
        parts.forEach((part) => {
            if (part >= 1024) {
                throw new Error(`Version string invalid, ${part} is too large`);
            }
        });

        // Let's create a new number which we will return later on
        let numericVersion = 0;

        // Shift all parts either 0, 10 or 20 bits to the left.
        for (let i = 0; i < 3; i++) {
            numericVersion |= parts[i] << i * 10;
        }

        return numericVersion;
    }

    /**
     * Open (or create) the IndexedDB database and object store for runs
     * 
     * @returns {Promise<IDBDatabase>}
     */
    async openDB() {
        return new Promise((resolve, reject) => {	
            const request = indexedDB.open(this.name, this.version);
            request.onerror = (event) => reject(event.target.error);

            request.onupgradeneeded = (event) => {
                const name = this.defaultObjectStoreName;
                const db = event.target.result;
                const transaction = event.target.transaction;

                const runsStore = db.objectStoreNames.contains(name) ? transaction.objectStore(name) : db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });

                if (!runsStore.indexNames.contains('date')) {
                    runsStore.createIndex('date', 'date', { unique: false });
                }
            };

            request.onsuccess = (event) => resolve(event.target.result);
        });
    }


    /**
     * Save a run to IndexedDB, returning a promise that resolves to the ID of the saved run
     * 
     * @param {object} run 
     * @returns 
     */
    async saveRecord(data, name = this.defaultObjectStoreName) {
        const db = await this.openDB();

        return new Promise(async (resolve, reject) => {
            db.onerror = (event) => reject(event.target.error);

            const request = db.transaction([name], 'readwrite')
                .objectStore(name)
                .put({ date: Date.now(), ...data });

            request.onsuccess = (event) => resolve(event.target.result);
        });
    }

    /**
     * Get a run by ID from IndexedDB
     * 
     * @param {BigInteger} id 
     * @returns {Promise<Run>} 
     */
    async getRecord(id, name = this.defaultObjectStoreName) {
        const db = await this.openDB();

        return new Promise(async (resolve, reject) => {
            db.onerror = (event) => reject(event.target.error);

            const request = db.transaction([name], 'readonly')
                .objectStore(name)
                .get(id)

            request.onsuccess = (event) => resolve(event.target.result);
        });
    }

    /**
     * Delete a run by ID from IndexedDB
     * 
     * @param {BigInteger} id 
     * @returns {Promise<void>} resolves when the operation is complete
     */
    async deleteRecord(id, name = this.defaultObjectStoreName) {
        const db = await this.openDB();

        return new Promise((resolve, reject) => {
            db.onerror = (event) => reject(event.target.error);

            const request = db.transaction([name], 'readwrite')
                .objectStore(name)
                .delete(id);

            request.onsuccess = (event) => resolve(event.target.result);
        });
    }

    /**
     * Get all runs from IndexedDB, returning a promise that resolves to an array of run objects
     * 
     * @returns {Promise<array<Run>>} 
     */
    async getAllData(name = this.defaultObjectStoreName) {
        const db = await this.openDB();

        return new Promise((resolve, reject) => {
            db.onerror = (event) => reject(event.target.error);

            const request = db.transaction([name])
                .objectStore(name)
                .getAll();

            request.onsuccess = (event) => resolve(event.target.result);
        });
    }


    /**
     * Get all data from IndexedDB, sorted by date
     * 
     * @param {boolean} decending
     * @returns {Promise<array<Run>>}
     */
    async getAllRunsByDate(decending, name = this.defaultObjectStoreName) {
        const db = await this.openDB();

        return new Promise((resolve, reject) => {
            db.onerror = (event) => reject(event.target.error);

            // Get all runs from the 'runs' object store using "date" index
            const request = db.transaction([name])
                .objectStore(name)
                .index('date')
                .getAll();

            request.onsuccess = (event) => {
                const data = event.target.result;
                resolve(decending ? data.reverse() : data)
            };
        });
    }


    /**
     * Clear all runs from IndexedDB, returning a promise that resolves when the operation is complete
     * 
     * @returns {Promise<array<void>>} 
     */
    async deleteAllData(name = this.defaultObjectStoreName) {
        const db = await this.openDB();

        return new Promise((resolve, reject) => {
            db.onerror = (event) => reject(event.target.error);

            const request = db.transaction([name], 'readwrite')
                .objectStore(name)
                .clear();

            request.onsuccess = (event) => resolve(event.target.result);
        });
    }
}