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
                    refresh_token: user.refreshToken,
                    grant_type: 'refresh_token'
                }
            });

            user.accessToken = response.data.access_token;
            user.refreshToken = response.data.refresh_token;
            user.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000);
            await user.save();

            return user.accessToken;
        } catch (error) {
            console.error('Error refreshing token:', error.response?.data || error.message);
            throw error;
        }
    }

    async getHeaders(user) {
        let token = user.accessToken;
        
        if (user.isTokenExpired && user.isTokenExpired()) {
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