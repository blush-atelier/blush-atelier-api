import { databaseOptions } from '../src/shared/infrastructure/database/database-options';
import { CreateProducts1794528000000 } from '../src/shared/infrastructure/database/migrations/1794528000000-create-products';
import { seedProducts } from '../src/shared/infrastructure/database/seed-products';
import type { DataSource, QueryRunner } from 'typeorm';
import { dbEnv } from './fixtures';

it('configura migraciones explicitas sin sincronizacion ni logs SQL', () => {
  expect(databaseOptions(dbEnv)).toMatchObject({
    type: 'postgres',
    port: 5432,
    ssl: false,
    synchronize: false,
    migrationsRun: false,
    logging: false,
  });
  expect(
    databaseOptions({
      ...dbEnv,
      POSTGRES_PORT: '5433',
      POSTGRES_SSL: 'true',
      NODE_ENV: 'production',
    }),
  ).toMatchObject({ port: 5433, ssl: { rejectUnauthorized: true } });
});
it.each(['POSTGRES_HOST', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'])(
  'rechaza configuracion incompleta %s',
  (key) => {
    expect(() => databaseOptions({ ...dbEnv, [key]: '' })).toThrow(
      'Missing database setting',
    );
  },
);
it.each(['abc', '0', '65536', '1.5'])('rechaza puerto %s', (port) => {
  expect(() => databaseOptions({ ...dbEnv, POSTGRES_PORT: port })).toThrow(
    'Invalid POSTGRES_PORT',
  );
});
it('rechaza TLS invalido o desactivado en produccion', () => {
  expect(() => databaseOptions({ ...dbEnv, POSTGRES_SSL: 'maybe' })).toThrow(
    'Invalid POSTGRES_SSL',
  );
  expect(() => databaseOptions({ ...dbEnv, NODE_ENV: 'production' })).toThrow(
    'requires TLS',
  );
});
it('migracion protege dinero y stock; permite rollback explicito', async () => {
  const query = jest.fn().mockResolvedValue(undefined);
  const runner = { query } as unknown as QueryRunner;
  const migration = new CreateProducts1794528000000();
  await migration.up(runner);
  expect(query.mock.calls[0][0]).toContain(
    'price_minor BIGINT NOT NULL CHECK (price_minor >= 0)',
  );
  expect(query.mock.calls[0][0]).toContain('stock_reserved <= stock_on_hand');
  await migration.down(runner);
  expect(query).toHaveBeenLastCalledWith('DROP TABLE products');
});
it('seed es parametrizado y no reinicia stock existente', async () => {
  const query = jest.fn().mockResolvedValue(undefined);
  await seedProducts({ query } as unknown as DataSource);
  expect(query.mock.calls[0][0]).toContain('ON CONFLICT DO NOTHING');
  expect(query.mock.calls[0][1]).toContain('8990000');
  query.mockRejectedValueOnce(new Error('DB unavailable'));
  await expect(
    seedProducts({ query } as unknown as DataSource),
  ).rejects.toThrow('DB unavailable');
});

it('el catálogo de referencia parametriza fotos y centavos de las cuatro marcas', async () => {
  const query = jest.fn().mockResolvedValue(undefined);
  await seedProducts({ query } as unknown as DataSource);
  const [sql, parameters] = query.mock.calls[0];
  expect(sql).toContain('image_url');
  expect(sql).not.toContain('UPDATE');
  expect(parameters).toEqual(
    expect.arrayContaining([
      'LIP-MAC-RUBYWOO',
      'LIP-TOOFACED-STARS',
      'BLUSH-ATENEA-PINKCHAI',
      'BLUSH-BLOOMSHELL-LOVE',
      '11500000',
      '12700000',
      '4400000',
      '2000000',
    ]),
  );
  expect(sql).not.toContain('Ruby Woo');
  expect(parameters).toHaveLength(176);
});
