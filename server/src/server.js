'use strict';
const http = require('http');
const env = require('./config/env');
const app = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/db');

let server;

async function start() {
  try {
    const db = await connectDatabase();

    // First-run: make sure the role/permission matrix and company settings exist.
    const { Role, CompanySettings, User } = require('./models');
    await Role.seedDefaults();
    if (!(await CompanySettings.findOne({ singleton: 'company' }))) {
      await CompanySettings.create({ singleton: 'company' });
    }
    const userCount = await User.countDocuments({ deletedAt: null });
    if (userCount === 0) {
      if (db.mode === 'memory' && env.SEED.demo) {
        // Zero-setup demo: seed a full sample company into the in-memory database.
        console.log('🌱 Empty database detected — seeding demo data (set MONGODB_URI for persistent data)…');
        const { runSeed } = require('./seed/seed');
        await runSeed({ skipConnect: true });
      } else if (!env.isProd) {
        console.log('ℹ️  No users found. Run `npm run seed` to create the Super Admin and demo data.');
      }
    }

    server = http.createServer(app);
    server.listen(env.PORT, '0.0.0.0', () => {
      console.log(`\n🚀 EMS API listening on http://0.0.0.0:${env.PORT}`);
      console.log(`   Environment : ${env.NODE_ENV}`);
      console.log(`   Database    : ${db.mode === 'atlas' ? 'MongoDB (MONGODB_URI)' : 'in-memory demo (set MONGODB_URI for persistence)'}`);
      console.log(`   CORS origin : ${env.CLIENT_ORIGIN}`);
      console.log(`   Health      : /api/health\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

const shutdown = async (signal) => {
  console.log(`\n${signal} received — shutting down gracefully...`);
  if (server) server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

start();
