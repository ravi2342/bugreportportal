const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
(async () => {
  const adapter = new PrismaPg(process.env.DATABASE_URL);
  const p = new PrismaClient({ adapter, __internal: { engine: { type: 'binary' } } });
  try {
    const rows = await p.bugReport.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
    console.log(JSON.stringify(rows, null, 2));
  } catch (e) {
    console.error('ERROR', e && e.message ? e.message : e);
  } finally {
    await p.$disconnect();
  }
})();
