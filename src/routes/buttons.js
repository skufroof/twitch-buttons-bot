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

// Get all buttons for current user
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const buttons = await Button.find({ userId: req.user._id }).sort('order');
        res.json(buttons);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create a new button
router.post('/', ensureAuthenticated, async (req, res) => {
    try {
        const { id, text, url, color, textColor, font, fontSize, icon } = req.body;
        
        const button = new Button({
            userId: req.user._id,
            id: id || `btn_${Date.now()}`,
            text,
            url,
            color: color || '#9146FF',
            textColor: textColor || '#FFFFFF',
            font: font || 'Arial',
            fontSize: fontSize || '14px',
            icon: icon || '🔘',
            order: await Button.countDocuments({ userId: req.user._id })
        });
        
        await button.save();
        
        // Refresh bot
        await twitchBotManager.refreshBot(req.user._id.toString());
        
        res.json(button);
    } catch (error) {
        if (error.code === 11000) {
            res.status(400).json({ error: 'Button with this ID already exists' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// Update a button
router.put('/:buttonId', ensureAuthenticated, async (req, res) => {
    try {
        const button = await Button.findOne({ 
            _id: req.params.buttonId, 
            userId: req.user._id 
        });
        
        if (!button) {
            return res.status(404).json({ error: 'Button not found' });
        }
        
        const allowedUpdates = ['text', 'url', 'color', 'textColor', 'font', 'fontSize', 'icon', 'enabled'];
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                button[field] = req.body[field];
            }
        });
        
        await button.save();
        
        // Refresh bot
        await twitchBotManager.refreshBot(req.user._id.toString());
        
        res.json(button);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a button
router.delete('/:buttonId', ensureAuthenticated, async (req, res) => {
    try {
        const result = await Button.findOneAndDelete({ 
            _id: req.params.buttonId, 
            userId: req.user._id 
        });
        
        if (!result) {
            return res.status(404).json({ error: 'Button not found' });
        }
        
        // Refresh bot
        await twitchBotManager.refreshBot(req.user._id.toString());
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reorder buttons
router.post('/reorder', ensureAuthenticated, async (req, res) => {
    try {
        const { buttonOrders } = req.body;
        
        for (const { id, order } of buttonOrders) {
            await Button.updateOne(
                { _id: id, userId: req.user._id },
                { order }
            );
        }
        
        // Refresh bot
        await twitchBotManager.refreshBot(req.user._id.toString());
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;