const express = require("express");
const Gun = require("gun");
const app = express();
const port = 3030;
require("gun/sea");
require("gun/lib/axe");
require("gun/lib/radisk");
require("gun/lib/store");
require("gun/lib/rindexed");

// Abilita CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(Gun.serve);

const server = app.listen(port, () => {
  console.log(`Relay peers listening at http://localhost:${port}`);
});

// Configura Gun con opzioni per il relay
const gun = Gun({
  web: server,
  file: 'relay-data',    // Directory per i dati del relay
  radisk: true,          // Abilita radisk
  localStorage: false,    // Disabilita localStorage per il server
  multicast: false,      // Disabilita multicast
  axe: true,             // Mantieni axe
  store: {               // Configura lo store
    put: function(key, data, cb) {
      // Implementa la logica di storage custom se necessario
      cb(null);
    },
    get: function(key, cb) {
      // Implementa la logica di retrieval custom se necessario
      cb(null);
    }
  }
});

// Gestione degli eventi
gun.on('put', function(msg) {
  // Log delle operazioni di scrittura
  console.log('Relay received data:', msg.put['#']);
});
