module.exports = {
    // ... altre configurazioni ...
    resolve: {
      fallback: {
        "ethers": require.resolve("ethers"),
        "crypto": require.resolve("crypto-browserify"),
        "stream": require.resolve("stream-browserify"),
        "assert": require.resolve("assert/"),
        "http": require.resolve("stream-http"),
        "https": require.resolve("https-browserify"),
        "os": require.resolve("os-browserify/browser"),
        "url": require.resolve("url/")
      }
    }
  }