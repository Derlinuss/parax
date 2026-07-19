// Unified monitor utilities
window.ParaxMonitor = {
    API_BASE: 'https://parax-vqqb.onrender.com',

    async getAuthToken() {
        return new Promise((resolve, reject) => {
            const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
                unsubscribe();
                if (user) {
                    user.getIdToken().then(resolve).catch(reject);
                } else {
                    reject(new Error("No user logged in"));
                }
            });
        });
    },

    async fetch(endpoint) {
        try {
            const token = await this.getAuthToken();
            const response = await fetch(`${this.API_BASE}${endpoint}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            return await response.json();
        } catch (err) {
            console.error(`Monitor Fetch Error (${endpoint}):`, err);
            throw err;
        }
    }
};
