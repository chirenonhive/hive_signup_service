# Hive Signup Service

A Node.js service that handles Hive blockchain account creation with support for both free and paid account tiers. This service integrates with the Hive blockchain and Transak payment gateway to provide a seamless account creation experience.

## Important Note

🚧 **Proof of Concept** 🚧

This is a proof-of-concept implementation of a Hive account creation service. While it demonstrates the basic functionality, please note:

- This is experimental code meant for learning and demonstration purposes
- It hasn't been thoroughly tested in production environments
- You should review and test the code before using it in any serious projects
- The code handles cryptocurrency transactions - always test with small amounts first!
- Feel free to modify, improve, and build upon this code for your needs

We'd love to see how you use and improve this project, but remember: cryptocurrencies involve real money, so always double-check everything and proceed with caution! 

## Features

- Dual account creation modes:
  - Free accounts with verification
  - Paid accounts with cryptocurrency payment support
- Real-time HIVE price tracking via CoinGecko API
- Secure payment processing through Transak
- Configurable pricing and safety limits
- SQLite database for transaction tracking
- Multiple Hive node failover support

## Prerequisites

- Node.js (v14 or higher)
- NPM or Yarn
- Basic understanding of the Hive blockchain
- Transak API credentials (for paid accounts)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/chirenonhive/hive-signup-service.git
cd hive-signup-service
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
PORT=3000
NODE_ENV=development
PAID_ACCOUNT_PRICE_USD=3.00
TRANSAK_API_KEY=your_transak_api_key
HIVE_RECEIVING_ACCOUNT=your_hive_account
BASE_URL=http://localhost:3000
```

## Configuration

The service includes several configurable parameters in the `config` object:

- `paidAccountPrice`: Price in USD for paid accounts (default: $3.00)
- `priceUpdateInterval`: How often to update HIVE price (default: 5 minutes)
- `minHiveAmount`: Minimum HIVE amount for transactions (default: 1.00)
- `maxHiveAmount`: Maximum HIVE amount for transactions (default: 10.00)

## API Documentation

### 1. Initialize Account Creation

```http
POST /api/init-account
Content-Type: application/json

{
    "username": "newuser123",
    "accountType": "paid"
}
```

#### Success Response (Paid Account):
```json
{
    "referenceId": "hive_signup_a1b2c3",
    "transakParams": {
        "apiKey": "your-transak-api-key",
        "environment": "STAGING",
        "cryptoCurrencyCode": "HIVE",
        "network": "mainnet",
        "walletAddress": "receiving-account",
        "memo": "hive_signup_a1b2c3",
        "defaultCryptoCurrency": "HIVE",
        "fiatAmount": 3.00,
        "fiatCurrency": "USD",
        "redirectURL": "http://localhost:3000/complete-signup/hive_signup_a1b2c3"
    },
    "pricing": {
        "usd": 3.00,
        "hive": 2.456,
        "hivePrice": 1.222
    },
    "username": "newuser123",
    "account_type": "paid",
    "status": "pending",
    "created_at": 1699123456789
}
```

#### Success Response (Free Account):
```json
{
    "referenceId": "hive_signup_x1y2z3",
    "username": "newuser123",
    "account_type": "free",
    "status": "pending",
    "verification_code": "123456",
    "created_at": 1699123456789
}
```

#### Error Response:
```json
{
    "error": "Username is invalid or taken"
}
```

### 2. Check Payment Status

```http
POST /api/check-payment
Content-Type: application/json

{
    "from": "sender_account",
    "amount": "3.000 HIVE",
    "memo": "hive_signup_a1b2c3"
}
```

#### Success Response:
```json
{
    "status": "success"
}
```

#### Error Response:
```json
{
    "error": "Invalid transaction"
}
```

### 3. Get Current Pricing

```http
GET /api/pricing
```

#### Success Response:
```json
{
    "usdPrice": 3.00,
    "hivePrice": 1.222,
    "hiveAmount": 2.456,
    "lastUpdated": 1699123456789
}
```

## Response Status Codes

- `200 OK`: Request successful
- `400 Bad Request`: Invalid parameters
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

## Database Schema

The service uses SQLite with the following schema for pending accounts:

```sql
CREATE TABLE pending_accounts (
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
```

## Running the Service

Development mode with auto-reload:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## Security Considerations

- The service includes safety limits for HIVE amounts
- Username validation before account creation
- Secure storage of pending account information
- Transaction verification through blockchain confirmations
- Price fluctuation protection with snapshots

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source and available under the MIT License.

## Acknowledgments

- Hive blockchain community
- dhive library maintainers
- Transak payment gateway team

## Support

For support, please open an issue in the GitHub repository or contact the maintenance team.