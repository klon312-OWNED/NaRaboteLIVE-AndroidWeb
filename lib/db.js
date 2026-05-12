'use strict';

const { MongoClient, GridFSBucket } = require('mongodb');

let client = null;
let db = null;

async function connect(uri) {
    if (db) return db;
    client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 30000,
        maxPoolSize: 5
    });
    await client.connect();
    db = client.db('narabote');
    console.log('  MongoDB:     Подключено');
    return db;
}

function getDb() {
    if (!db) throw new Error('MongoDB not connected');
    return db;
}

function gridFs() {
    return new GridFSBucket(db, { bucketName: 'attachments' });
}

async function close() {
    if (client) {
        await client.close();
        client = null;
        db = null;
    }
}

module.exports = { connect, getDb, gridFs, close };
