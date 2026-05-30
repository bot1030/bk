# JK Discord Bot

Economy bot with Coins, JK餘額, daily rewards, coinflip, slots, mines, fishing, rods, and rich leaderboard.

## Local setup

1. Install Node.js 22.12.0 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and fill in your values.
4. Run `npm run db:push`.
5. Run `npm run deploy` to register commands.
6. Run `npm start`.

## Railway setup

Add these Railway variables:

```env
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
DATABASE_URL=
```

Then deploy from GitHub.
