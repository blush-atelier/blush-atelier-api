import dataSource from './data-source';
import { seedProducts } from './seed-products';

export async function runSeed(): Promise<void> {
  await dataSource.initialize();
  try {
    await seedProducts(dataSource);
  } finally {
    await dataSource.destroy();
  }
}
if (require.main === module) {
  void runSeed().catch(() => {
    console.error('Seed failed; check database configuration and migrations.');
    process.exitCode = 1;
  });
}
