const express = require("express");
const app = express();

const chatRoutes = require("./routes/chat.routes");

app.app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", chatRoutes);

app.get("/", (req, res) => {
  res.send("Hello World");
});

module.exports = app;
