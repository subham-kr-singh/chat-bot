const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, 'Question is required'],
      trim: true,
      maxlength: [1000, 'Question cannot exceed 1000 characters'],
    },
    answer: {
      type: String,
      required: [true, 'Answer is required'],
    },
  },
  {
    timestamps: true, // adds createdAt + updatedAt automatically
  }
);

// Index for faster queries sorted by date
chatSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Chat', chatSchema);
