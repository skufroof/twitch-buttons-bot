const express = require('express');
const Button = require('../models/Button');
const twitchBotManager = require('../services/twitchBot');
const router = express.Router();

const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Not authenticated' });
};

router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const buttons = await Button.findByUserId(req.user.id);
        res.json(buttons);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/', ensureAuthenticated, async (req, res) => {
    try {
        const { id, text, url, color, textColor, font, fontSize, icon } = req.body;
        
        const count = await Button.countByUserId(req.user.id);
        
        const button = await Button.create({
            userId: req.user.id,
            id: id || `btn_${Date.now()}`,
            text,
            url,
            color: color || '#9146FF',
            textColor: textColor || '#FFFFFF',
            font: font || 'Arial',
            fontSize: fontSize || '14px',
            icon: icon || '🔘',
            order: count
        });
        
        await twitchBotManager.refreshBot(req.user.id);
        
        res.json(button);
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ error: 'Button with this ID already exists' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

router.put('/:buttonId', ensureAuthenticated, async (req, res) => {
    try {
        const button = await Button.findById(req.params.buttonId, req.user.id);
        
        if (!button) {
            return res.status(404).json({ error: 'Button not found' });
        }
        
        const updates = {};
        const allowedUpdates = ['text', 'url', 'color', 'text_color', 'font', 'font_size', 'icon', 'enabled'];
        
        allowedUpdates.forEach(field => {
            const reqField = field === 'text_color' ? 'textColor' : 
                            field === 'font_size' ? 'fontSize' : field;
            if (req.body[reqField] !== undefined) {
                updates[field] = req.body[reqField];
            }
        });
        
        const updatedButton = await Button.update(req.params.buttonId, req.user.id, updates);
        await twitchBotManager.refreshBot(req.user.id);
        
        res.json(updatedButton);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:buttonId', ensureAuthenticated, async (req, res) => {
    try {
        const result = await Button.delete(req.params.buttonId, req.user.id);
        
        if (!result) {
            return res.status(404).json({ error: 'Button not found' });
        }
        
        await twitchBotManager.refreshBot(req.user.id);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/reorder', ensureAuthenticated, async (req, res) => {
    try {
        const { buttonOrders } = req.body;
        await Button.reorder(req.user.id, buttonOrders);
        await twitchBotManager.refreshBot(req.user.id);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;