/* ============================================================
 *  Copyright (c) 2026 Антипин Андрей Александрович
 *  All rights reserved. See LICENSE file.
 * ============================================================
 *  МЕНЕДЖЕР ПОЛЬЗОВАТЕЛЕЙ (lib/users.js)
 * ============================================================
 *  Хранение: data/users.json
 *  Роли: worker (по умолчанию), manager (назначает админ)
 *  Каждый пользователь: login, password, name, role
 *  Администратор — отдельная учётная запись (логин + пароль).
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function base32Encode(buf) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '', result = '';
    for (const b of buf) bits += b.toString(2).padStart(8, '0');
    for (let i = 0; i + 5 <= bits.length; i += 5) result += alphabet[parseInt(bits.slice(i, i + 5), 2)];
    return result;
}

function generateTOTPSecret() {
    return base32Encode(crypto.randomBytes(20));
}

function verifyTOTP(secret, token, windowSize) {
    windowSize = windowSize || 1;
    if (!secret || !token) return false;
    const cleanToken = String(token).replace(/\s/g, '');
    const now = Math.floor(Date.now() / 30000);
    for (let i = -windowSize; i <= windowSize; i++) {
        const counter = now + i;
        const buf = Buffer.alloc(8);
        buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
        buf.writeUInt32BE(counter & 0xFFFFFFFF, 4);
        const key = Buffer.from(secret, 'ascii');
        const hmac = crypto.createHmac('sha1', key);
        hmac.update(buf);
        const hash = hmac.digest();
        const offset = hash[hash.length - 1] & 0x0F;
        const binary = ((hash[offset] & 0x7F) << 24) | ((hash[offset + 1] & 0xFF) << 16) | ((hash[offset + 2] & 0xFF) << 8) | (hash[offset + 3] & 0xFF);
        const otp = binary % 1000000;
        if (String(otp).padStart(6, '0') === cleanToken) return true;
    }
    return false;
}

function decodeBase32(str) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const c of str) {
        const idx = alphabet.indexOf(c.toUpperCase());
        if (idx === -1) continue;
        bits += idx.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return Buffer.from(bytes);
}

/* ===================== ХЕШИРОВАНИЕ ПАРОЛЕЙ ===================== */

const SCRYPT_KEYLEN = 64;
const SALT_LEN = 16;

/** Создаёт хеш пароля: salt(hex):hash(hex) */
function hashPassword(password) {
    const salt = crypto.randomBytes(SALT_LEN).toString('hex');
    const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
    return salt + ':' + hash;
}

/** Проверка пароля с поддержкой миграции plaintext → scrypt */
function verifyPassword(password, stored) {
    if (!stored) return false;
    const parts = stored.split(':');
    if (parts.length !== 2 || parts[0].length !== SALT_LEN * 2 || parts[1].length !== SCRYPT_KEYLEN * 2) {
        return false;
    }
    const check = crypto.scryptSync(password, parts[0], SCRYPT_KEYLEN).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(parts[1], 'hex'), Buffer.from(check, 'hex'));
}

/** Определяет, нужна ли миграция (пароль всё ещё plaintext) */
function needsMigration(stored) {
    if (!stored) return false;
    const parts = stored.split(':');
    return parts.length !== 2 || parts[0].length !== SALT_LEN * 2 || parts[1].length !== SCRYPT_KEYLEN * 2;
}

/* ===================== ЗАЩИТА ОТ ПЕРЕБОРА ===================== */

const _loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60000;

function checkRateLimit(key) {
    cleanupRateLimit();
    const rec = _loginAttempts.get(key);
    if (!rec) return true;
    if (Date.now() - rec.first > LOCKOUT_MS) { _loginAttempts.delete(key); return true; }
    return rec.count < MAX_ATTEMPTS;
}
function recordFailedAttempt(key) {
    const rec = _loginAttempts.get(key);
    if (!rec || Date.now() - rec.first > LOCKOUT_MS) {
        _loginAttempts.set(key, { count: 1, first: Date.now() });
    } else { rec.count++; }
}
function resetAttempts(key) { _loginAttempts.delete(key); }

function cleanupRateLimit() {
    const now = Date.now();
    for (const [key, rec] of _loginAttempts) {
        if (now - rec.first > LOCKOUT_MS) _loginAttempts.delete(key);
    }
}

/* ===================== СИНХРОННАЯ ПАУЗА ======================= */

/** Не грузит CPU (в отличие от busy-wait) */
function syncSleep(ms) {
    try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(1, ms | 0)); }
    catch (_) { const end = Date.now() + ms; while (Date.now() < end) {} }
}

class UserManager {

    constructor(filePath) {
        this.filePath = filePath;
        this._cache = null;
        this._cacheMtime = 0;
        this._ensure();
    }

    _ensure() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(this.filePath)) {
            this._save({ admin: { login: 'admin', password: hashPassword('admin'), mustChange: true }, users: {} });
            return;
        }
        /* Миграция: удаляем записи без пароля, хешируем plaintext-пароли */
        const data = this._load();
        let dirty = false;
        for (const [id, u] of Object.entries(data.users)) {
            if (!u.password) { delete data.users[id]; dirty = true; }
            else if (needsMigration(u.password)) { u.password = hashPassword(u.password); dirty = true; }
        }
        if (needsMigration(data.admin.password)) { data.admin.password = hashPassword(data.admin.password); dirty = true; }
        if (dirty) this._save(data);
    }

    _load() {
        try {
            const mtime = fs.statSync(this.filePath).mtimeMs;
            if (this._cache && this._cacheMtime === mtime) return this._cache;
        } catch (_) {}
        const data = this._retry(() => JSON.parse(fs.readFileSync(this.filePath, 'utf-8')));
        try { this._cacheMtime = fs.statSync(this.filePath).mtimeMs; } catch (_) {}
        this._cache = data;
        return data;
    }
    _save(d) {
        const tmp = this.filePath + '.tmp';
        this._retry(() => fs.writeFileSync(tmp, JSON.stringify(d, null, 2), 'utf-8'));
        this._retry(() => fs.renameSync(tmp, this.filePath));
        try { this._cacheMtime = fs.statSync(this.filePath).mtimeMs; this._cache = d; } catch (_) {}
    }

    /** Повтор при EBUSY/EPERM (файл занят другим процессом в сети) */
    _retry(fn, maxAttempts = 5, delay = 200) {
        for (let i = 0; i < maxAttempts; i++) {
            try { return fn(); }
            catch (e) {
                if ((e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES') && i < maxAttempts - 1) {
                    syncSleep(delay * Math.pow(1.5, i));
                } else { throw e; }
            }
        }
    }

    /* ==================== АДМИН ============================== */

    adminLogin(login, password) {
        if (!checkRateLimit('admin')) return { success: false, message: 'Слишком много попыток. Подождите 1 минуту.' };
        const data = this._load();
        if (data.admin.login !== login || !verifyPassword(password, data.admin.password)) {
            recordFailedAttempt('admin');
            return { success: false, message: 'Неверный логин или пароль администратора' };
        }
        resetAttempts('admin');
        if (needsMigration(data.admin.password)) { data.admin.password = hashPassword(password); this._save(data); }
        return { success: true, mustChange: !!data.admin.mustChange };
    }

    changeAdminPassword(oldPass, newPass) {
        const data = this._load();
        if (!verifyPassword(oldPass, data.admin.password)) return { success: false, message: 'Неверный старый пароль' };
        if (!newPass || newPass.length < 8) return { success: false, message: 'Пароль слишком короткий (мин. 8)' };
        data.admin.password = hashPassword(newPass);
        delete data.admin.mustChange;
        this._save(data);
        return { success: true, message: 'Пароль администратора изменён' };
    }

    enable2FA(userId) {
        const data = this._load();
        const secret = generateTOTPSecret();
        const userKey = userId === 'admin' ? 'admin' : data.users[userId];
        if (!userKey && userId !== 'admin') return { success: false, message: 'Пользователь не найден' };
        if (userId === 'admin') {
            data.admin.totpSecret = decodeBase32(secret).toString('base64');
            data.admin.totpEnabled = false;
        } else {
            data.users[userId].totpSecret = decodeBase32(secret).toString('base64');
            data.users[userId].totpEnabled = false;
        }
        this._save(data);
        const issuer = encodeURIComponent('НаРаботеLIVE');
        const account = encodeURIComponent(userId);
        return { success: true, secret, uri: 'otpauth://totp/' + account + '?issuer=' + issuer + '&secret=' + secret };
    }

    confirm2FA(userId, token) {
        const data = this._load();
        const secretB64 = userId === 'admin' ? data.admin.totpSecret : (data.users[userId] ? data.users[userId].totpSecret : null);
        if (!secretB64) return { success: false, message: '2FA не настроена' };
        const secret = Buffer.from(secretB64, 'base64').toString('ascii');
        if (!verifyTOTP(base32Encode(Buffer.from(secretB64, 'base64')), token, 1)) return { success: false, message: 'Неверный код' };
        if (userId === 'admin') data.admin.totpEnabled = true;
        else data.users[userId].totpEnabled = true;
        this._save(data);
        return { success: true, message: '2FA включена' };
    }

    disable2FA(userId) {
        const data = this._load();
        if (userId === 'admin') { delete data.admin.totpSecret; delete data.admin.totpEnabled; }
        else if (data.users[userId]) { delete data.users[userId].totpSecret; delete data.users[userId].totpEnabled; }
        this._save(data);
        return { success: true, message: '2FA отключена' };
    }

    verify2FA(userId, token) {
        const data = this._load();
        const enabled = userId === 'admin' ? data.admin.totpEnabled : (data.users[userId] ? data.users[userId].totpEnabled : false);
        if (!enabled) return { success: true };
        const secretB64 = userId === 'admin' ? data.admin.totpSecret : (data.users[userId] ? data.users[userId].totpSecret : null);
        if (!secretB64) return { success: true };
        if (!verifyTOTP(base32Encode(Buffer.from(secretB64, 'base64')), token, 1)) return { success: false, message: 'Неверный код 2FA' };
        return { success: true };
    }

    /* ==================== РЕГИСТРАЦИЯ / ВХОД ================= */

    register(login, password, displayName, tabNum) {
        login = String(login).trim();
        if (!login || login.length < 2) return { success: false, message: 'Логин: минимум 2 символа' };
        if (!password || password.length < 8) return { success: false, message: 'Пароль: минимум 8 символов' };
        const data = this._load();
        if (data.users[login]) return { success: false, message: 'Пользователь «' + login + '» уже существует' };
        const hue = Math.floor(Math.random() * 360);
        data.users[login] = {
            name: String(displayName || login).trim(),
            password: hashPassword(password),
            role: 'worker',
            tabNum: String(tabNum || '').trim(),
            color: 'hsl(' + hue + ',60%,55%)'
        };
        this._save(data);
        return { success: true, message: 'Регистрация успешна. Войдите в систему.' };
    }

    userLogin(login, password) {
        login = String(login).trim();
        if (!login) return { success: false, message: 'Введите логин' };
        if (!password) return { success: false, message: 'Введите пароль' };
        if (!checkRateLimit('user:' + login)) return { success: false, message: 'Слишком много попыток. Подождите 1 минуту.' };
        const data = this._load();
        const user = data.users[login];
        if (!user || !verifyPassword(password, user.password)) { recordFailedAttempt('user:' + login); return { success: false, message: 'Неверный логин или пароль' }; }
        resetAttempts('user:' + login);
        if (needsMigration(user.password)) { user.password = hashPassword(password); this._save(data); }
        return { success: true, empId: login, role: user.role, name: user.name, tabNum: user.tabNum || '', canNotes: !!user.canNotes };
    }

    /* ==================== УПРАВЛЕНИЕ ========================= */

    getUser(empId) {
        const data = this._load();
        return data.users[String(empId).trim()] || null;
    }

    listUsers() {
        const data = this._load();
        return Object.entries(data.users).map(([id, u]) => ({
            id, name: u.name, role: u.role, tabNum: u.tabNum || '', canNotes: !!u.canNotes, color: u.color || ''
        })).sort((a, b) => a.id.localeCompare(b.id));
    }

    setRole(empId, role) {
        if (role !== 'worker' && role !== 'manager') return { success: false, message: 'Недопустимая роль' };
        const id = String(empId).trim();
        const data = this._load();
        if (!data.users[id]) return { success: false, message: 'Не найден: ' + id };
        data.users[id].role = role;
        this._save(data);
        return { success: true, message: id + ' → ' + (role === 'manager' ? 'руководитель' : 'сотрудник') };
    }

    renameUser(empId, newName) {
        const id = String(empId).trim();
        const data = this._load();
        if (!data.users[id]) return { success: false, message: 'Не найден' };
        data.users[id].name = String(newName).trim() || id;
        this._save(data);
        return { success: true };
    }

    deleteUser(empId) {
        const id = String(empId).trim();
        const data = this._load();
        if (!data.users[id]) return { success: false, message: 'Не найден' };
        delete data.users[id];
        this._save(data);
        return { success: true, message: 'Сотрудник ' + id + ' удалён' };
    }

    /** Сброс пароля пользователя (только для админа) */
    resetPassword(empId, newPassword) {
        const id = String(empId).trim();
        if (!newPassword || newPassword.length < 8) return { success: false, message: 'Пароль: минимум 8 символов' };
        const data = this._load();
        if (!data.users[id]) return { success: false, message: 'Не найден: ' + id };
        data.users[id].password = hashPassword(newPassword);
        this._save(data);
        return { success: true, message: 'Пароль сброшен для ' + id };
    }

    getLastLogin(login) {
        const data = this._load();
        const user = data.users[login];
        return user ? user.lastLogin || null : null;
    }

    updateLastLogin(login) {
        const data = this._load();
        if (data.users[login]) {
            data.users[login].lastLogin = new Date().toISOString();
            this._save(data);
        }
    }
    setNotesPerm(empId, allowed) {
        const id = String(empId).trim();
        const data = this._load();
        if (!data.users[id]) return { success: false, message: 'Не найден: ' + id };
        data.users[id].canNotes = !!allowed;
        this._save(data);
        return { success: true, message: 'Права на заметки ' + (allowed ? 'выданы' : 'сняты') + ' для ' + id };
    }
    setDefaults(empId, defaults) {
        const id = String(empId).trim();
        const data = this._load();
        if (!data.users[id]) return { success: false, message: 'Не найден: ' + id };
        data.users[id].defaults = defaults;
        this._save(data);
        return { success: true };
    }
    setUserColor(empId, color) {
        const id = String(empId).trim();
        const data = this._load();
        if (!data.users[id]) return { success: false, message: 'Не найден: ' + id };
        data.users[id].color = String(color).trim();
        this._save(data);
        return { success: true };
    }

    getDefaults(empId) {
        const id = String(empId).trim();
        const data = this._load();
        const u = data.users[id];
        const defs = (u && u.defaults) || {};
        return {
            start: defs.start || null, end: defs.end || null,
            lunch: defs.lunch != null ? defs.lunch : null,
            norm: defs.norm != null ? defs.norm : null,
            rate: defs.rate != null ? defs.rate : null,
            hourlyWage: defs.hourlyWage != null ? defs.hourlyWage : null,
            allowanceTemplate: defs.allowanceTemplate || null
        };
    }
}

module.exports = UserManager;
