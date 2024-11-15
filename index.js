const express = require("express");
const Gun = require("gun");
const app = express();
const port = 3030;
require('gun/sea');
app.use(Gun.serve);

const server = app.listen(port, () => {
  console.log(`Relay peers listening at http://localhost:${port}`);
});

Gun({ web: server });
