"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.hydratePoints = void 0;
// functions/src/hydrate.ts
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
if (admin.apps.length === 0)
    admin.initializeApp();
function parseCookies(cookieHeader) {
    const out = {};
    if (!cookieHeader)
        return out;
    cookieHeader.split(';').forEach(p => {
        const i = p.indexOf('=');
        if (i > -1)
            out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1));
    });
    return out;
}
exports.hydratePoints = (0, https_1.onRequest)(async (req, res) => {
    const ORIGINS = new Set([
        'http://127.0.0.1:5005', // 測試站
        'http://localhost:5005', // 測試站
        'https://akashic-library-test.web.app', // ✅ 正式站
    ]);
    const origin = String(req.headers.origin || '');
    if (ORIGINS.has(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Vary', 'Origin');
    }
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Cache-Control', 'private, no-store');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Max-Age', '86400');
        res.status(204).send('');
        return;
    }
    if (req.method !== 'GET') {
        res.status(405).json({ ok: false, error: 'method_not_allowed' });
        return;
    }
    // 兩者擇一（容忍舊參數 uid）
    const q = req.query;
    const address = String(q.address || q.uid || '').toLowerCase();
    if (!address) {
        res.status(400).json({ ok: false, error: 'missing_address' });
        return;
    }
    // 可選：若你希望 GET 也驗 cookie，可打開下列幾行
    const cookies = parseCookies(req.headers.cookie);
    try {
        const sessionAddr = JSON.parse(cookies['__session'] || '{}').address?.toLowerCase() || '';
        if (sessionAddr && sessionAddr !== address) {
            res.status(403).json({ ok: false, error: 'address_mismatch' });
            return;
        }
    }
    catch { }
    const db = admin.firestore();
    const userDoc = db.collection('users').doc(address);
    const u = await userDoc.get();
    const total = Number(u.get('pointsTotal') || 0);
    const recentSnap = await userDoc.collection('points')
        .orderBy('serverTs', 'desc')
        .limit(20)
        .get();
    const recent = recentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, total, recent });
});
