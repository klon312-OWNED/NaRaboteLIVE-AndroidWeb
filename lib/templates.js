/* ============================================================
 *  Copyright (c) 2026 Антипин Андрей Александрович
 *  All rights reserved. See LICENSE file.
 * ============================================================
 *  МЕНЕДЖЕР ШАБЛОНОВ (lib/templates.js)
 * ============================================================
 *  Хранение: data/templates.json
 *  Шаблон: {id, name, cycleDays, days:[{dayOffset,isWork,start,end,lunch,rate,breakType}]}
 *  Методы: load, save, list, get, add, update, remove
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_TEMPLATES = [
    {
        id: '5x2', name: '5/2', cycleDays: 7,
        days: [
            { dayOffset: 0, isWork: true, start: '09:00', end: '18:00', lunch: 1, rate: 1, breakType: 'F130' },
            { dayOffset: 1, isWork: true, start: '09:00', end: '18:00', lunch: 1, rate: 1, breakType: 'F130' },
            { dayOffset: 2, isWork: true, start: '09:00', end: '18:00', lunch: 1, rate: 1, breakType: 'F130' },
            { dayOffset: 3, isWork: true, start: '09:00', end: '18:00', lunch: 1, rate: 1, breakType: 'F130' },
            { dayOffset: 4, isWork: true, start: '09:00', end: '18:00', lunch: 1, rate: 1, breakType: 'F130' },
            { dayOffset: 5, isWork: false, start: '', end: '', lunch: 0, rate: 0, breakType: '' },
            { dayOffset: 6, isWork: false, start: '', end: '', lunch: 0, rate: 0, breakType: '' }
        ]
    },
    {
        id: '2x2', name: '2/2', cycleDays: 4,
        days: [
            { dayOffset: 0, isWork: true, start: '09:00', end: '18:00', lunch: 1, rate: 1, breakType: 'F130' },
            { dayOffset: 1, isWork: true, start: '09:00', end: '18:00', lunch: 1, rate: 1, breakType: 'F130' },
            { dayOffset: 2, isWork: false, start: '', end: '', lunch: 0, rate: 0, breakType: '' },
            { dayOffset: 3, isWork: false, start: '', end: '', lunch: 0, rate: 0, breakType: '' }
        ]
    },
    {
        id: '3x3', name: '3/3', cycleDays: 6,
        days: [
            { dayOffset: 0, isWork: true, start: '09:00', end: '18:00', lunch: 1, rate: 1, breakType: 'F130' },
            { dayOffset: 1, isWork: true, start: '09:00', end: '18:00', lunch: 1, rate: 1, breakType: 'F130' },
            { dayOffset: 2, isWork: true, start: '09:00', end: '18:00', lunch: 1, rate: 1, breakType: 'F130' },
            { dayOffset: 3, isWork: false, start: '', end: '', lunch: 0, rate: 0, breakType: '' },
            { dayOffset: 4, isWork: false, start: '', end: '', lunch: 0, rate: 0, breakType: '' },
            { dayOffset: 5, isWork: false, start: '', end: '', lunch: 0, rate: 0, breakType: '' }
        ]
    },
    {
        id: '1x3', name: '1/3', cycleDays: 4,
        days: [
            { dayOffset: 0, isWork: true, start: '09:00', end: '18:00', lunch: 1, rate: 1, breakType: 'F130' },
            { dayOffset: 1, isWork: false, start: '', end: '', lunch: 0, rate: 0, breakType: '' },
            { dayOffset: 2, isWork: false, start: '', end: '', lunch: 0, rate: 0, breakType: '' },
            { dayOffset: 3, isWork: false, start: '', end: '', lunch: 0, rate: 0, breakType: '' }
        ]
    }
];

class TemplateManager {
    constructor(dataRoot) {
        this.filePath = path.join(dataRoot, 'data', 'templates.json');
        this._templates = null;
    }

    _ensure() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(this.filePath)) {
            this._templates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
            this._write();
            return;
        }
        if (!this._templates) {
            try { this._templates = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')); }
            catch (_) { this._templates = []; }
        }
        let dirty = false;
        for (const dt of DEFAULT_TEMPLATES) {
            if (!this._templates.some(t => t.id === dt.id)) {
                this._templates.push(JSON.parse(JSON.stringify(dt)));
                dirty = true;
            }
        }
        if (dirty) this._write();
    }

    _write() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = this.filePath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this._templates, null, 2), 'utf-8');
        fs.renameSync(tmp, this.filePath);
    }

    load() { this._ensure(); return this._templates; }
    list() { return this.load().map(t => ({ id: t.id, name: t.name, cycleDays: t.cycleDays })); }

    get(id) { this._ensure(); return this._templates.find(t => t.id === id) || null; }

    add(template) {
        this._ensure();
        if (!template.id) template.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        if (this._templates.some(t => t.id === template.id))
            return { success: false, message: 'Шаблон с таким ID уже существует' };
        this._templates.push(template);
        try { this._write(); } catch (e) { return { success: false, message: 'Ошибка записи: ' + e.message }; }
        return { success: true, id: template.id };
    }

    update(id, template) {
        this._ensure();
        const idx = this._templates.findIndex(t => t.id === id);
        if (idx === -1) return { success: false, message: 'Шаблон не найден' };
        template.id = id;
        this._templates[idx] = template;
        try { this._write(); } catch (e) { return { success: false, message: 'Ошибка записи: ' + e.message }; }
        return { success: true };
    }

    remove(id) {
        this._ensure();
        const idx = this._templates.findIndex(t => t.id === id);
        if (idx === -1) return { success: false, message: 'Шаблон не найден' };
        this._templates.splice(idx, 1);
        try { this._write(); } catch (e) { return { success: false, message: 'Ошибка записи: ' + e.message }; }
        return { success: true };
    }
}

module.exports = TemplateManager;
