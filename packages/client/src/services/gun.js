import Gun from "gun";
import "gun/sea";
import "gun/axe";

const gun = Gun({
  peers: ["http://localhost:8765/gun"], // Assicurati che questo sia l'URL corretto del tuo server Gun
});

export default gun;
