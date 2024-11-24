const fs = require('fs');
const path = require('path');
const os = require('os');
const { Mogu } = require("@scobru/mogu");

async function restoreRadata() {
    try {
        const radataPath = path.join(os.tmpdir(), 'gun-data');
        
        // Inizializza Mogu
        const mogu = new Mogu(
            [], // no peers needed
            '', // no encryption
            'PINATA',
            {
                apiKey: process.env.PINATA_API_KEY || '',
                apiSecret: process.env.PINATA_API_SECRET || ''
            }
        );

        // Chiedi all'utente l'hash IPFS
        const hash = process.argv[2];
        if (!hash) {
            console.error('⚠️ Specificare l\'hash IPFS come parametro');
            console.log('Uso: npm run restore:radata <hash>');
            process.exit(1);
        }

        console.log('📦 Ripristino da IPFS hash:', hash);

        // Elimina radata corrente
        if (fs.existsSync(radataPath)) {
            fs.rmSync(radataPath, { recursive: true, force: true });
        }

        // Ripristina da IPFS
        await mogu.load(hash);
        
        console.log('✅ Radata ripristinato con successo');
        console.log('📊 Nodi ripristinati:', mogu.getAllNodes().length);

    } catch (error) {
        console.error('❌ Errore durante il ripristino:', error);
        process.exit(1);
    }
}

restoreRadata(); 