const express = require('express');
const { Client } = require('@hiveio/dhive');
const crypto = require('crypto');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize Hive client
const client = new Client([
    'https://api.hive.blog',
    'https://api.deathwing.me',
    'https://rpc.ausbit.dev',
    'https://hive-api.3speak.tv'
]);

// Configuration object
const config = {
    paidAccountPrice: parseFloat(process.env.PAID_ACCOUNT_PRICE_USD) || 3.00, // Price in USD
    priceUpdateInterval: 5 * 60 * 1000, // 5 minutes
    minHiveAmount: 1.00, // Minimum HIVE amount regardless of price
    maxHiveAmount: 10.00 // Safety cap for maximum HIVE amount
};

// Cache for HIVE price
let hivePrice = {
    usd: 0,
    lastUpdated: 0
};

// Database initialization
let db;
async function initializeDatabase() {
    const dbPath = path.join(__dirname, 'accounts.db');
    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS pending_accounts (
            reference_id TEXT PRIMARY KEY,
            username TEXT UNIQUE,
            account_type TEXT,
            status TEXT,
            verification_code TEXT,
            payment_amount_usd DECIMAL(10,2),
            payment_amount_hive DECIMAL(10,3),
            created_at INTEGER,
            keys_json TEXT,
            hive_price_snapshot DECIMAL(10,3)
        );

        CREATE INDEX IF NOT EXISTS idx_status ON pending_accounts(status);
        CREATE INDEX IF NOT EXISTS idx_created_at ON pending_accounts(created_at);
    `);
}

// Fetch current HIVE price
async function updateHivePrice() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=hive&vs_currencies=usd');
        const data = await response.json();
        hivePrice = {
            usd: data.hive.usd,
            lastUpdated: Date.now()
        };
        console.log(`Updated HIVE price: $${hivePrice.usd}`);
    } catch (error) {
        console.error('Error updating HIVE price:', error);
        // If we can't get the price, we'll use the last known price
        // If no last price, we'll need to handle that in the account creation logic
    }
}

// Calculate HIVE amount needed for the USD price
function calculateHiveAmount(usdAmount) {
    if (!hivePrice.usd) return config.minHiveAmount; // Fallback to minimum amount
    
    const hiveAmount = usdAmount / hivePrice.usd;
    
    // Apply safety bounds
    if (hiveAmount < config.minHiveAmount) return config.minHiveAmount;
    if (hiveAmount > config.maxHiveAmount) return config.maxHiveAmount;
    
    return parseFloat(hiveAmount.toFixed(3));
}

// Initialize price updates
async function initializePriceUpdates() {
    await updateHivePrice();
    setInterval(updateHivePrice, config.priceUpdateInterval);
}

// Endpoints

app.post('/api/init-account', async (req, res) => {
    const { username, accountType } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    // Check username validity
    const isValid = await isUsernameValid(username);
    if (!isValid) {
        return res.status(400).json({ error: 'Username is invalid or taken' });
    }

    const referenceId = generateReferenceId();
    const accountData = {
        username,
        account_type: accountType,
        status: 'pending',
        created_at: Date.now()
    };

    if (accountType === 'free') {
        accountData.verification_code = crypto.randomInt(100000, 999999).toString();
    } else if (accountType === 'paid') {
        accountData.payment_amount_usd = config.paidAccountPrice;
        accountData.payment_amount_hive = calculateHiveAmount(config.paidAccountPrice);
        accountData.hive_price_snapshot = hivePrice.usd;
    }

    // Store in database
    await db.run(`
        INSERT INTO pending_accounts 
        (reference_id, username, account_type, status, verification_code, 
         payment_amount_usd, payment_amount_hive, hive_price_snapshot, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        referenceId,
        accountData.username,
        accountData.account_type,
        accountData.status,
        accountData.verification_code,
        accountData.payment_amount_usd,
        accountData.payment_amount_hive,
        accountData.hive_price_snapshot,
        accountData.created_at
    ]);

    // For paid accounts, generate Transak parameters
    const transakParams = accountType === 'paid' ? {
        apiKey: process.env.TRANSAK_API_KEY,
        environment: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'STAGING',
        cryptoCurrencyCode: 'HIVE',
        network: 'mainnet',
        walletAddress: process.env.HIVE_RECEIVING_ACCOUNT,
        memo: referenceId,
        defaultCryptoCurrency: 'HIVE',
        fiatAmount: accountData.payment_amount_usd,
        fiatCurrency: 'USD',
        redirectURL: `${process.env.BASE_URL}/complete-signup/${referenceId}`
    } : null;

    res.json({
        referenceId,
        transakParams,
        pricing: accountType === 'paid' ? {
            usd: accountData.payment_amount_usd,
            hive: accountData.payment_amount_hive,
            hivePrice: accountData.hive_price_snapshot
        } : null,
        ...accountData
    });
});

// Step 3: Check payment status (webhook endpoint for Hive transactions)
app.post('/api/check-payment', async (req, res) => {
    const { from, amount, memo } = req.body;
    const hiveAmount = parseFloat(amount.split(' ')[0]); // Extract amount from "3.000 HIVE"

    const account = await db.get(
        'SELECT * FROM pending_accounts WHERE reference_id = ? AND status = ?',
        [memo, 'pending']
    );

    if (!account) {
        return res.status(404).json({ error: 'Invalid transaction' });
    }

    if (hiveAmount >= account.payment_amount_hive) {
        await db.run(
            'UPDATE pending_accounts SET status = ? WHERE reference_id = ?',
            ['paid', memo]
        );
        // Trigger account creation
        await createHiveAccount(memo);
    }

    res.json({ status: 'success' });
});

// Add endpoint to get current pricing
app.get('/api/pricing', async (req, res) => {
    if (Date.now() - hivePrice.lastUpdated > config.priceUpdateInterval) {
        await updateHivePrice();
    }

    res.json({
        usdPrice: config.paidAccountPrice,
        hivePrice: hivePrice.usd,
        hiveAmount: calculateHiveAmount(config.paidAccountPrice),
        lastUpdated: hivePrice.lastUpdated
    });
});

// [Previous code for other endpoints remains the same...]

// Initialize database and price updates before starting server
Promise.all([initializeDatabase(), initializePriceUpdates()]).then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Paid account price: $${config.paidAccountPrice} USD`);
    });
}).catch(err => {
    console.error('Failed to initialize:', err);
    process.exit(1);
});