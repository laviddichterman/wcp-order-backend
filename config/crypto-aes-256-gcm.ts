import { Buffer } from 'node:buffer';
import crypto from 'crypto';

// Demo implementation of using `aes-256-gcm` with node.js's `crypto` lib.
const aes256gcm = (key : crypto.CipherKey) => {
  const ALGO : crypto.CipherGCMTypes = 'aes-256-gcm';

  // encrypt returns base64-encoded ciphertext
  const encrypt = (str : string) => {
    // Hint: the `iv` should be unique (but not necessarily random).
    // `randomBytes` here are (relatively) slow but convenient for
    // demonstration.
    const iv = Buffer.from(crypto.randomBytes(16)).toString('utf8');
    const cipher = crypto.createCipheriv(ALGO, key, iv);

    // Hint: Larger inputs (it's GCM, after all!) should use the stream API
    let enc = cipher.update(str, 'utf8', 'base64');
    enc += cipher.final('base64');
    return [enc, iv, cipher.getAuthTag()];
  };

  // decrypt decodes base64-encoded ciphertext into a utf8-encoded string
  const decrypt = (enc : string, iv : string, authTag : Buffer) => {
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    let str = decipher.update(enc, 'base64', 'utf8');
    str += decipher.final('utf8');
    return str;
  };

  return {
    encrypt,
    decrypt,
  };
};

const KEY = Buffer.from(crypto.randomBytes(32)).toString('utf8');

module.exports = aes256gcm(KEY);
