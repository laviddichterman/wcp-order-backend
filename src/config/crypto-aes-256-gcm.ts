import { Buffer } from 'node:buffer';
import crypto from 'crypto';

type EncryptResult = { enc: string; iv: Buffer; auth: Buffer; } ;
// Demo implementation of using `aes-256-gcm` with node.js's `crypto` lib.
const aes256gcm = (key: Buffer) => {
  const ALGO: crypto.CipherGCMTypes = 'aes-256-gcm';

  // encrypt returns base64-encoded ciphertext
  const encrypt = (str: string) => {
    // Hint: the `iv` should be unique (but not necessarily random).
    // `randomBytes` here are (relatively) slow but convenient for
    // demonstration.
    // @ts-ignore
    const iv = Buffer.from(crypto.randomBytes(16), 'utf8');
    const cipher = crypto.createCipheriv(ALGO, key, iv);

    // Hint: Larger inputs (it's GCM, after all!) should use the stream API
    let enc = cipher.update(str, 'utf8', 'base64');
    enc += cipher.final('base64');
    return { enc, iv, auth: cipher.getAuthTag() } as EncryptResult;
  };

  // decrypt decodes base64-encoded ciphertext into a utf8-encoded string
  const decrypt = (lock: EncryptResult) => {
    const decipher = crypto.createDecipheriv(ALGO, key, lock.iv);
    decipher.setAuthTag(lock.auth);
    let str = decipher.update(lock.enc, 'base64', 'utf8');
    str += decipher.final('utf8');
    return str;
  };

  return {
    encrypt,
    decrypt,
  };
};

// @ts-ignore
const KEY = Buffer.from(crypto.randomBytes(32), 'utf8');

export default aes256gcm(KEY);