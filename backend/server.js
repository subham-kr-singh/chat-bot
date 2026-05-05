const app = require("./src/app");
const connectDB = require("./src/config/db");
require("dotenv").config();

const PORT = process.env.PORT || 8080;

connectDB();

app.listen(PORT, () => {
  console.log(`🚀 Server is Running on http://localhost:${PORT}`);
});
