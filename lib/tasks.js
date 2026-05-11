/* ============================================================
 *  Copyright (c) 2026 Антипин Андрей Александрович
 *  All rights reserved. See LICENSE file.
 * ============================================================
 *  МЕНЕДЖЕР ЗАДАЧ (lib/tasks.js)
 * ============================================================
 *  Хранение: data/tasks.json (шифруется через DataCrypto)
 *  Задача: { id, date, time, duration, title, desc, author,
 *            assignee, status, completionNote, cancelReason,
 *            completedAt, cancelledAt, created }
 *  date — dd.mm.yyyy, time — HH:MM, duration — минуты
 *  status — pending | completed | cancelled
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

function syncSleep(ms) {
    try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(1, ms | 0)); }
    catch (_) { const end = Date.now() + ms; while (Date.now() < end) {} }
}

function retry(fn, maxAttempts, delay) {
    maxAttempts = maxAttempts || 5; delay = delay || 200;
    for (let i = 0; i < maxAttempts; i++) {
        try { return fn(); }
        catch (e) {
            if ((e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES') && i < maxAttempts - 1) {
                syncSleep(delay * Math.pow(1.5, i));
            } else { throw e; }
        }
    }
}

class TaskManager {
    constructor(filePath, dataCrypto) {
        this.filePath = filePath;
        this.dataCrypto = dataCrypto;
        this._cache = null;
        this._cacheMtime = 0;
        this._ensure();
    }

    _ensure() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(this.filePath)) {
            this._save([]);
        }
    }

    _load() {
        try {
            const mtime = fs.statSync(this.filePath).mtimeMs;
            if (this._cache && this._cacheMtime === mtime) return this._cache;
        } catch (_) {}
        const raw = retry(() => fs.readFileSync(this.filePath, 'utf-8'));
        let data;
        if (this.dataCrypto && this.dataCrypto.isEnabled()) {
            data = this.dataCrypto.decrypt(raw) || [];
        } else {
            try { data = JSON.parse(raw); } catch (_) { data = []; }
        }
        try { this._cacheMtime = fs.statSync(this.filePath).mtimeMs; } catch (_) {}
        this._cache = data;
        return data;
    }

    _save(data) {
        let content;
        if (this.dataCrypto && this.dataCrypto.isEnabled()) {
            content = this.dataCrypto.encrypt(data);
        } else {
            content = JSON.stringify(data, null, 2);
        }
        const tmp = this.filePath + '.tmp';
        retry(() => fs.writeFileSync(tmp, content, 'utf-8'));
        retry(() => fs.renameSync(tmp, this.filePath));
        try { this._cacheMtime = fs.statSync(this.filePath).mtimeMs; this._cache = data; } catch (_) {}
    }

    getMtime() {
        try { return fs.statSync(this.filePath).mtimeMs; } catch (_) { return 0; }
    }

    loadByDate(dateStr) {
        const all = this._load();
        return all.filter(t => t.date === dateStr).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    }

    loadAll() {
        return this._load().sort((a, b) => {
            const c = (a.date || '').localeCompare(b.date || '');
            return c !== 0 ? c : (a.time || '').localeCompare(b.time || '');
        });
    }

    loadByDateRange(dates) {
        const set = new Set(dates);
        return this._load().filter(t => set.has(t.date)).sort((a, b) => {
            const c = (a.date || '').localeCompare(b.date || '');
            return c !== 0 ? c : (a.time || '').localeCompare(b.time || '');
        });
    }

    add(task) {
        task.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        task.created = new Date().toISOString();
        if (!task.status) task.status = 'pending';
        if (!task.assignee) task.assignee = task.author || '';
        const all = this._load();
        all.push(task);
        this._save(all);
        return { success: true, id: task.id };
    }

    complete(taskId, note) {
        const all = this._load();
        const idx = all.findIndex(t => t.id === taskId);
        if (idx === -1) return { success: false, message: 'Задача не найдена' };
        if (all[idx].status !== 'pending') return { success: false, message: 'Задача уже обработана' };
        all[idx].status = 'completed';
        all[idx].completionNote = String(note || '').trim();
        all[idx].completedAt = new Date().toISOString();
        this._save(all);
        return { success: true };
    }

    cancel(taskId, reason) {
        const all = this._load();
        const idx = all.findIndex(t => t.id === taskId);
        if (idx === -1) return { success: false, message: 'Задача не найдена' };
        if (all[idx].status !== 'pending') return { success: false, message: 'Задача уже обработана' };
        reason = String(reason || '').trim();
        if (!reason) return { success: false, message: 'Укажите причину отмены' };
        all[idx].status = 'cancelled';
        all[idx].cancelReason = reason;
        all[idx].cancelledAt = new Date().toISOString();
        this._save(all);
        return { success: true };
    }

    update(taskId, changes) {
        const all = this._load();
        const idx = all.findIndex(t => t.id === taskId);
        if (idx === -1) return { success: false, message: 'Задача не найдена' };
        if (all[idx].status !== 'pending') return { success: false, message: 'Задача уже обработана' };
        const allowed = ['time', 'duration', 'title', 'desc', 'assignee'];
        const safe = {};
        for (const k of allowed) { if (changes[k] !== undefined) safe[k] = changes[k]; }
        Object.assign(all[idx], safe, { updated: new Date().toISOString() });
        this._save(all);
        return { success: true };
    }

    remove(taskId) {
        const all = this._load();
        const idx = all.findIndex(t => t.id === taskId);
        if (idx === -1) return { success: false, message: 'Задача не найдена' };
        all.splice(idx, 1);
        this._save(all);
        return { success: true };
    }

    loadIndex() {
        const all = this._load();
        const idx = {};
        all.forEach(t => {
            if (!idx[t.date]) idx[t.date] = [];
            idx[t.date].push({ id: t.id, time: t.time, title: t.title, duration: t.duration });
        });
        return idx;
    }
}

module.exports = TaskManager;
