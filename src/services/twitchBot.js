const tmi = require('tmi.js');
const chalk = require('chalk');
const User = require('../models/User');
const Button = require('../models/Button');
const Settings = require('../models/Settings');
const twitchApi = require('./twitchApi');

class TwitchBotManager {
    constructor() {
        this.bots = new Map(); // userId -> { client, settings, buttons, isOnline, lastMessageTime, messageCount, interval }
        this.statusCheckInterval = null;
    }

    generateButtonHTML(button) {
        const buttonStyle = `
            display: inline-block;
            background: ${button.color};
            color: ${button.text_color};
            font-family: ${button.font};
            font-size: ${button.font_size};
            padding: 8px 16px;
            margin: 5px;
            border-radius: 5px;
            text-decoration: none;
            cursor: pointer;
            transition: transform 0.2s;
        `;

        return `<a href="${button.url}" target="_blank" rel="noopener noreferrer" style="${buttonStyle}" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">${button.icon ? button.icon + ' ' : ''}${button.text}</a>`;
    }

    generateMessage(buttons, template) {
        const enabledButtons = buttons.filter(btn => btn.enabled);
        if (enabledButtons.length === 0) return null;
        
        const buttonsHTML = enabledButtons.map(btn => this.generateButtonHTML(btn)).join('');
        return template.replace('{buttons}', buttonsHTML);
    }

    async loadUserData(userId) {
        const [buttons, settings] = await Promise.all([
            Button.findByUserIdAndEnabled(userId),
            Settings.getOrCreate(userId)
        ]);
        
        return { buttons, settings };
    }

    shouldSendMessage(botData) {
        const { settings, isOnline, lastMessageTime, messageCount } = botData;
        
        if (settings.send_only_when_online && !isOnline) return false;
        
        const now = Date.now();
        const timeSinceLastMessage = (now - lastMessageTime) / 1000;
        if (timeSinceLastMessage < settings.message_interval) return false;
        if (messageCount < settings.messages_between) return false;
        
        return true;
    }

    async sendButtonMessage(userId, channel, botData) {
        if (!this.shouldSendMessage(botData)) return;
        
        const message = this.generateMessage(botData.buttons, botData.settings.message_template);
        if (!message) return;
        
        try {
            await botData.client.say(channel, message);
            botData.lastMessageTime = Date.now();
            botData.messageCount = 0;
            
            console.log(chalk.green(`[${new Date().toISOString()}] Sent message to ${channel}`));
        } catch (error) {
            console.error(chalk.red(`Error sending message to ${channel}:`), error.message);
        }
    }

    async startBot(user) {
        const userId = user.id;
        
        if (this.bots.has(userId)) {
            console.log(chalk.yellow(`Bot already running for ${user.username}`));
            return;
        }
        
        const { buttons, settings } = await this.loadUserData(userId);
        
        const client = new tmi.Client({
            options: { debug: false },
            connection: { reconnect: true, secure: true },
            identity: {
                username: user.username,
                password: user.access_token
            },
            channels: [user.username]
        });
        
        await client.connect();
        
        const botData = {
            client,
            settings,
            buttons,
            isOnline: false,
            lastMessageTime: Date.now(),
            messageCount: 0,
            interval: null
        };
        
        client.on('message', (channel, tags, message, self) => {
            if (!self) {
                botData.messageCount++;
            }
        });
        
        botData.interval = setInterval(async () => {
            if (user.is_bot_active && botData.isOnline) {
                await this.sendButtonMessage(userId, user.username, botData);
            }
        }, 10000);
        
        this.bots.set(userId, botData);
        
        console.log(chalk.green(`✅ Bot started for ${user.username}`));
        
        if (settings.send_first_message_immediately && user.is_bot_active) {
            setTimeout(async () => {
                if (botData.isOnline) {
                    await this.sendButtonMessage(userId, user.username, botData);
                }
            }, 5000);
        }
        
        await this.updateOnlineStatus(user);
    }
    
    async updateOnlineStatus(user) {
        const botData = this.bots.get(user.id);
        if (!botData) return;
        
        try {
            const isOnline = await twitchApi.isUserOnline(user.twitch_id, user.access_token);
            
            if (isOnline !== botData.isOnline) {
                botData.isOnline = isOnline;
                console.log(chalk.cyan(`${user.username} is now ${isOnline ? 'ONLINE 🟢' : 'OFFLINE 🔴'}`));
                
                if (isOnline && user.is_bot_active && botData.settings.send_first_message_immediately) {
                    setTimeout(async () => {
                        await this.sendButtonMessage(user.id, user.username, botData);
                    }, 5000);
                }
            }
        } catch (error) {
            console.error(chalk.red(`Error checking online status for ${user.username}:`), error.message);
        }
    }
    
    async stopBot(userId) {
        const botData = this.bots.get(userId);
        if (botData) {
            if (botData.interval) {
                clearInterval(botData.interval);
            }
            await botData.client.disconnect();
            this.bots.delete(userId);
            console.log(chalk.yellow(`🛑 Bot stopped for user ${userId}`));
        }
    }
    
    async refreshBot(userId) {
        const user = await User.findById(userId);
        if (user && user.is_bot_active) {
            await this.stopBot(userId);
            await this.startBot(user);
        }
    }
    
    async startAllBots() {
        const users = await User.findAllActive();
        console.log(chalk.blue(`Starting bots for ${users.length} users...`));
        
        for (const user of users) {
            try {
                await this.startBot(user);
            } catch (error) {
                console.error(chalk.red(`Failed to start bot for ${user.username}:`), error.message);
            }
        }
        
        this.statusCheckInterval = setInterval(async () => {
            const users = await User.findAllActive();
            for (const user of users) {
                await this.updateOnlineStatus(user);
            }
        }, 120000);
        
        console.log(chalk.green(`✅ All bots started successfully`));
    }
    
    async shutdown() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
        }
        
        for (const [userId, botData] of this.bots) {
            if (botData.interval) {
                clearInterval(botData.interval);
            }
            await botData.client.disconnect();
        }
        
        console.log(chalk.yellow('🛑 All bots stopped'));
    }
}

module.exports = new TwitchBotManager();