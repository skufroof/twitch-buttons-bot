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
            color: ${button.textColor};
            font-family: ${button.font};
            font-size: ${button.fontSize};
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
            Button.find({ userId, enabled: true }).sort('order'),
            Settings.findOne({ userId })
        ]);
        
        return { 
            buttons: buttons || [], 
            settings: settings || new Settings({ userId }) 
        };
    }

    shouldSendMessage(botData) {
        const { settings, isOnline, lastMessageTime, messageCount } = botData;
        
        // Check if should send based on online status
        if (settings.sendOnlyWhenOnline && !isOnline) return false;
        
        // Check time interval
        const now = Date.now();
        const timeSinceLastMessage = (now - lastMessageTime) / 1000;
        if (timeSinceLastMessage < settings.messageInterval) return false;
        
        // Check messages between
        if (messageCount < settings.messagesBetween) return false;
        
        return true;
    }

    async sendButtonMessage(userId, channel, botData) {
        if (!this.shouldSendMessage(botData)) return;
        
        const message = this.generateMessage(botData.buttons, botData.settings.messageTemplate);
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
        const userId = user._id.toString();
        
        if (this.bots.has(userId)) {
            console.log(chalk.yellow(`Bot already running for ${user.username}`));
            return;
        }
        
        const { buttons, settings } = await this.loadUserData(user._id);
        
        const client = new tmi.Client({
            options: { debug: false },
            connection: { reconnect: true, secure: true },
            identity: {
                username: user.username,
                password: user.accessToken
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
        
        // Setup message handler to count messages
        client.on('message', (channel, tags, message, self) => {
            if (!self) {
                botData.messageCount++;
            }
        });
        
        // Setup interval for sending messages (check every 10 seconds)
        botData.interval = setInterval(async () => {
            if (user.isBotActive && botData.isOnline) {
                await this.sendButtonMessage(userId, user.username, botData);
            }
        }, 10000);
        
        this.bots.set(userId, botData);
        
        console.log(chalk.green(`✅ Bot started for ${user.username}`));
        
        // Send first message immediately if enabled
        if (settings.sendFirstMessageImmediately && user.isBotActive) {
            setTimeout(async () => {
                if (botData.isOnline) {
                    await this.sendButtonMessage(userId, user.username, botData);
                }
            }, 5000);
        }
        
        // Check online status immediately
        await this.updateOnlineStatus(user);
    }
    
    async updateOnlineStatus(user) {
        const botData = this.bots.get(user._id.toString());
        if (!botData) return;
        
        try {
            const isOnline = await twitchApi.isUserOnline(user.twitchId, user.accessToken);
            
            if (isOnline !== botData.isOnline) {
                botData.isOnline = isOnline;
                console.log(chalk.cyan(`${user.username} is now ${isOnline ? 'ONLINE 🟢' : 'OFFLINE 🔴'}`));
                
                // Send message immediately when stream goes online
                if (isOnline && user.isBotActive && botData.settings.sendFirstMessageImmediately) {
                    setTimeout(async () => {
                        await this.sendButtonMessage(user._id.toString(), user.username, botData);
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
        if (user && user.isBotActive) {
            await this.stopBot(userId);
            await this.startBot(user);
        }
    }
    
    async startAllBots() {
        const users = await User.find({ isBotActive: true });
        console.log(chalk.blue(`Starting bots for ${users.length} users...`));
        
        for (const user of users) {
            try {
                await this.startBot(user);
            } catch (error) {
                console.error(chalk.red(`Failed to start bot for ${user.username}:`), error.message);
            }
        }
        
        // Start interval to check online status every 2 minutes
        this.statusCheckInterval = setInterval(async () => {
            const users = await User.find({ isBotActive: true });
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