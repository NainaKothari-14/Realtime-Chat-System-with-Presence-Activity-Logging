const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    roomId: String,//roomId to identify chat room
    userId: String,//userId of the sender
    text: String,//message text
    timestamp: {
      type: Date,
      default: Date.now //when the message is created by the user
    }
  },
  { timestamps: true } //when the message is saved in the database
);

module.exports = mongoose.model("Message", messageSchema);
