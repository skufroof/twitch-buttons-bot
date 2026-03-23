const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    messageInterval: {
        type: Number,
        default: 300, // seconds (5 minutes)
        min: 30,
        max: 3600
    },
    messagesBetween: {
        type: Number,
        default: 5,
        min: 1,
        max: 50
    },
    sendOnlyWhenOnline: {
        type: Boolean,
        default: true
    },
    sendFirstMessageImmediately: {
        type: Boolean,
        default: true
    },
    messageTemplate: {
        type: String,
        default: '✨ Check out our links: {buttons} ✨',
        maxlength: 500
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Settings', settingsSchema);