// generate keys for client with gun sea and save it in json file
import Gun from 'gun';
import { setKeys, getKeys } from './keys.js';

const SEA = Gun.SEA;
const seaPair = await SEA.pair()
setKeys(seaPair)

console.log(getKeys())




