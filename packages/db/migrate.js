const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/alphawatch'
  });

  await client.connect();
  try {
    await client.query(schema);
    await client.query(
      `insert into migrations (id) values ($1)
       on conflict (id) do nothing`,
      [`schema-${Date.now()}`]
    );
    console.log('database migration complete');
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
