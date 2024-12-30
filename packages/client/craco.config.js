const path = require("path");

module.exports = {
  webpack: {
    alias: {
      "#protocol": path.resolve(__dirname, "src/protocol"),
      "#components": path.resolve(__dirname, "src/components"),
    },
  },
};
