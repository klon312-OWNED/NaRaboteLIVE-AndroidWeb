/* ============================================================
 *  Copyright (c) 2026 Антипин Андрей Александрович
 *  All rights reserved. See LICENSE file.
 * ============================================================
 *  ШИФРОВАНИЕ ДАННЫХ (lib/crypto.js)
 * ============================================================
 *  AES-256-GCM с ключом, хранящимся в data/.enc_key
 *  Если ключа нет — данные НЕ шифруются (обратная совместимость)
 *  Формат зашифрованного файла: JSON { iv, tag, data } (base64)
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const KEY_FILE = '.enc_key';

class DataCrypto {
    constructor(dataDir) {
        this.keyPath = path.join(dataDir, KEY_FILE);
        this._key = null;
    }

    _loadKey() {
        if (this._key) return this._key;
        if (!fs.existsSync(this.keyPath)) return null;
        try {
            this._key = Buffer.from(fs.readFileSync(this.keyPath, 'utf-8').trim(), 'hex');
            if (this._key.length !== KEY_LEN) { this._key = null; return null; }
            return this._key;
        } catch (_) { return null; }
    }

    isEnabled() { return !!this._loadKey(); }

    enable() {
        if (this._loadKey()) return true;
        const key = crypto.randomBytes(KEY_LEN);
        fs.writeFileSync(this.keyPath, key.toString('hex'), { mode: 0o600 });
        this._key = key;
        return true;
    }

    disable() {
        this._key = null;
        if (fs.existsSync(this.keyPath)) fs.unlinkSync(this.keyPath);
    }

    backupKey(backupDir) {
        if (!fs.existsSync(this.keyPath)) return false;
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        try {
            fs.copyFileSync(this.keyPath, path.join(backupDir, KEY_FILE));
            return true;
        } catch (_) { return false; }
    }

    restoreKey(backupDir) {
        const backupKeyPath = path.join(backupDir, KEY_FILE);
        if (!fs.existsSync(backupKeyPath)) return false;
        try {
            fs.copyFileSync(backupKeyPath, this.keyPath);
            this._key = null;
            return !!this._loadKey();
        } catch (_) { return false; }
    }

    encrypt(jsonData) {
        const key = this._loadKey();
        if (!key) return JSON.stringify(jsonData);
        const iv = crypto.randomBytes(IV_LEN);
        const cipher = crypto.createCipheriv(ALGO, key, iv);
        const plain = JSON.stringify(jsonData);
        let enc = cipher.update(plain, 'utf-8', 'base64');
        enc += cipher.final('base64');
        const tag = cipher.getAuthTag();
        return JSON.stringify({ iv: iv.toString('base64'), tag: tag.toString('base64'), data: enc });
    }

    decrypt(fileContent) {
        const key = this._loadKey();
        if (!key) {
            try { return JSON.parse(fileContent); } catch (_) { return null; }
        }
        try {
            const wrapper = JSON.parse(fileContent);
            if (!wrapper.iv || !wrapper.tag || !wrapper.data) {
                try { return JSON.parse(fileContent); } catch (_) { return null; }
            }
            const iv = Buffer.from(wrapper.iv, 'base64');
            const tag = Buffer.from(wrapper.tag, 'base64');
            const decipher = crypto.createDecipheriv(ALGO, key, iv);
            decipher.setAuthTag(tag);
            let dec = decipher.update(wrapper.data, 'base64', 'utf-8');
            dec += decipher.final('utf-8');
            return JSON.parse(dec);
        } catch (e) {
            try { return JSON.parse(fileContent); } catch (_) { return null; }
        }
    }
}

module.exports = DataCrypto;
