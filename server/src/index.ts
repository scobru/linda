import express from 'express';
import http from 'http';
import cors from 'cors';
import Gun from 'gun';

const app = express();
app.use(cors());
app.use(Gun.serve);

const server = http.createServer(app);

// Simple GunDB node configuration
const gun = Gun({ web: server });

app.get('/', (req, res) => {
  res.send('GunDB Signal Relay is running.');
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`GunDB node running on port ${PORT}`);
});
