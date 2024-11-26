{
    "source": {
      "include": ["src"],
      "includePattern": ".+\\.js(doc|x)?$"
    },
    "plugins": ["plugins/markdown"],
    "opts": {
      "destination": "docs",
      "recurse": true,
      "verbose": true
    },
    "templates": {
      "cleverLinks": false,
      "monospaceLinks": false
    }
  }
  