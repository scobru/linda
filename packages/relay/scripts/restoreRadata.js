const fs = require('fs');
const path = require('path');
const os = require('os');
const { Mogu } = require("@scobru/mogu");

require('dotenv').config();

async function restoreRadata() {
    try {
        const radataPath = path.join(os.tmpdir(), 'gun-data');
        
        // Inizializza Mogu con la nuova configurazione
        const mogu = new Mogu({
            storageService: 'PINATA',
            storageConfig: {
                apiKey: process.env.PINATA_API_KEY || '',
                apiSecret: process.env.PINATA_API_SECRET || ''
            }
        });

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

        // Ripristina da IPFS usando il nuovo metodo restore
        const result = await mogu.restore(hash);
        
        if (result) {
            console.log('✅ Radata ripristinato con successo');
            
            // Verifica l'integrità del backup
            const comparison = await mogu.compareBackup(hash);
            if (comparison.isEqual) {
                console.log('✅ Verifica integrità backup completata con successo');
            } else {
                console.warn('⚠️ Differenze rilevate nel backup:', comparison.differences);
            }
        } else {
            throw new Error('Ripristino fallito');
        }

    } catch (error) {
        console.error('❌ Errore durante il ripristino:', error);
        process.exit(1);
    }
}

restoreRadata(); 