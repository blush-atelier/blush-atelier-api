const { DataSource } = require('typeorm');
const {
  databaseOptions,
} = require('../dist/shared/infrastructure/database/database-options');

async function main() {
  const source = new DataSource(databaseOptions());

  try {
    await source.initialize();

    const migrations = await source.runMigrations({
      transaction: 'all',
    });

    console.log(`Migraciones ejecutadas: ${migrations.length}`);
  } finally {
    if (source.isInitialized) {
      await source.destroy();
    }
  }
}

main().catch((error) => {
  console.error('Error al ejecutar migraciones:', error.message);
  process.exitCode = 1;
});
