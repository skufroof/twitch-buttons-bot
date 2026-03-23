const mongoose = require('mongoose');

const buttonSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    id: {
        type: String,
        required: true
    },
    text: {
        type: String,
        required: true,
        trim: true
    },
    url: {
        type: String,
        required: true,
        trim: true
    },
    color: {
        type: String,
        default: '#9146FF',
        match: /^#[0-9A-Fa-f]{6}$/
    },
    textColor: {
        type: String,
        default: '#FFFFFF',
        match: /^#[0-9A-Fa-f]{6}$/
    },
    font: {
        type: String,
        default: 'Arial'
    },
    fontSize: {
        type: String,
        default: '14px'
    },
    icon: {
        type: String,
        default: '🔘'
    },
    order: {
        type: Number,
        default: 0
    },
    enabled: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Compound index to ensure unique button ID per user
buttonSchema.index({ userId: 1, id: 1 }, { unique: true });
buttonSchema.index({ userId: 1, order: 1 });

module.exports = mongoose.model('Button', buttonSchema);