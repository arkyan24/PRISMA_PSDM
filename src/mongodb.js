const { MongoClient } = require('mongodb');

let clientInstance = global._prismaMongoClient || null;
let dbInstance = null;
let isConnecting = false;

function getUri() {
  return process.env.MONGODB_URI || null;
}

function isMongoEnabled() {
  return !!getUri();
}

function getClientPromise() {
  const uri = getUri();
  if (!uri) return null;

  if (global._prismaMongoClientPromise) {
    return global._prismaMongoClientPromise;
  }

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 10000,
  });

  global._prismaMongoClientPromise = client.connect()
    .then(c => {
      console.log('[MongoDB] Connected to MongoDB Atlas successfully.');
      return c;
    })
    .catch(err => {
      global._prismaMongoClientPromise = null;
      console.error('[MongoDB] Connection error:', err.message);
      throw err;
    });

  return global._prismaMongoClientPromise;
}

async function getClient() {
  const p = getClientPromise();
  if (!p) return null;
  try {
    return await p;
  } catch (err) {
    return null;
  }
}

async function getDb() {
  if (dbInstance) return dbInstance;
  const client = await getClient();
  if (!client) return null;
  dbInstance = client.db('prisma_db');
  return dbInstance;
}

// ─── Vault Synchronization (Auth / Users / Sessions) ───
async function fetchVaultFromMongo() {
  try {
    const db = await getDb();
    if (!db) return null;
    const doc = await db.collection('vault').findOne({ _id: 'main_vault' });
    if (doc) {
      const { _id, ...vaultData } = doc;
      return vaultData;
    }
    return null;
  } catch (err) {
    console.error('[MongoDB] Error fetching vault:', err.message);
    return null;
  }
}

async function saveVaultToMongo(vaultData) {
  try {
    const db = await getDb();
    if (!db || !vaultData) return false;
    const cleanDoc = JSON.parse(JSON.stringify(vaultData));
    await db.collection('vault').replaceOne(
      { _id: 'main_vault' },
      { _id: 'main_vault', ...cleanDoc },
      { upsert: true }
    );
    return true;
  } catch (err) {
    console.error('[MongoDB] Error saving vault:', err.message);
    return false;
  }
}

// ─── Tenant Synchronization (Monitors / Keywords / Results / Settings) ───
async function fetchTenantFromMongo(tenantName) {
  try {
    const db = await getDb();
    if (!db) return null;
    const safeTenant = tenantName || 'psdm.muhammadiyah';
    const doc = await db.collection('tenants').findOne({ _id: safeTenant });
    if (doc) {
      const { _id, ...tenantData } = doc;
      return tenantData;
    }
    return null;
  } catch (err) {
    console.error(`[MongoDB] Error fetching tenant ${tenantName}:`, err.message);
    return null;
  }
}

async function saveTenantToMongo(tenantName, tenantData) {
  try {
    const db = await getDb();
    if (!db || !tenantData) return false;
    const safeTenant = tenantName || 'psdm.muhammadiyah';
    const cleanDoc = JSON.parse(JSON.stringify(tenantData));
    await db.collection('tenants').replaceOne(
      { _id: safeTenant },
      { _id: safeTenant, ...cleanDoc },
      { upsert: true }
    );
    return true;
  } catch (err) {
    console.error(`[MongoDB] Error saving tenant ${tenantName}:`, err.message);
    return false;
  }
}

async function fetchAllTenantsFromMongo() {
  try {
    const db = await getDb();
    if (!db) return [];
    const docs = await db.collection('tenants').find({}, { projection: { _id: 1 } }).toArray();
    return docs.map(d => d._id);
  } catch (err) {
    console.error('[MongoDB] Error listing tenants:', err.message);
    return [];
  }
}

module.exports = {
  isMongoEnabled,
  getClient,
  getDb,
  fetchVaultFromMongo,
  saveVaultToMongo,
  fetchTenantFromMongo,
  saveTenantToMongo,
  fetchAllTenantsFromMongo
};
