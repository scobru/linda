
import ZEN from 'zen';

async function inspect() {
    console.log('ZEN keys:', Object.keys(ZEN));
    const user = (ZEN as any).user ? (ZEN as any).user() : null;
    if (user) {
        console.log('User node keys:', Object.keys(user));
    }
}

inspect();
