const axios = require('axios');
const User = require('../models/User');

class TwitchAPI {
    constructor() {
        this.clientId = process.env.TWITCH_CLIENT_ID;
        this.clientSecret = process.env.TWITCH_CLIENT_SECRET;
        this.baseURL = 'https://api.twitch.tv/helix';
        this.authURL = 'https://id.twitch.tv/oauth2';
    }

    async refreshAccessToken(user) {
        try {
            const response = await axios.post(`${this.authURL}/token`, null, {
                params: {
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    refresh_token: user.refresh_token,
                    grant_type: 'refresh_token'
                }
            });

            const updatedUser = await User.update(user.id, {
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                token_expiry: new Date(Date.now() + response.data.expires_in * 1000)
            });

            return updatedUser.access_token;
        } catch (error) {
            console.error('Error refreshing token:', error.response?.data || error.message);
            throw error;
        }
    }

    async getHeaders(user) {
        let token = user.access_token;
        
        if (user.token_expiry && new Date(user.token_expiry) < new Date()) {
            token = await this.refreshAccessToken(user);
        }
        
        return {
            'Client-ID': this.clientId,
            'Authorization': `Bearer ${token}`
        };
    }

    async isUserOnline(userId, accessToken) {
        try {
            const response = await axios.get(`${this.baseURL}/streams`, {
                params: { user_id: userId },
                headers: {
                    'Client-ID': this.clientId,
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            return response.data.data && response.data.data.length > 0;
        } catch (error) {
            console.error('Error checking stream status:', error.message);
            return false;
        }
    }

    async validateToken(accessToken) {
        try {
            const response = await axios.get(`${this.authURL}/validate`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            return response.data;
        } catch (error) {
            return null;
        }
    }
}

module.exports = new TwitchAPI();