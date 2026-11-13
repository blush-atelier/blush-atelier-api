import { CustomerOrmEntity } from '../../../customers/infrastructure/customer.orm-entity';
import { DeliveryOrmEntity } from '../../../deliveries/infrastructure/delivery.orm-entity';
import { TransactionOrmEntity } from '../../../transactions/infrastructure/transaction.orm-entity';
import { CreateCheckout1794528001000 } from './migrations/1794528001000-create-checkout';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { ProductOrmEntity } from '../../../products/infrastructure/product.orm-entity';
import { CreateProducts1794528000000 } from './migrations/1794528000000-create-products';

export function databaseOptions(
  env: NodeJS.ProcessEnv = process.env,
): PostgresConnectionOptions {
  for (const key of [
    'POSTGRES_HOST',
    'POSTGRES_DB',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
  ]) {
    if (!env[key]?.trim()) throw new Error(`Missing database setting: ${key}`);
  }
  const port = Number(env.POSTGRES_PORT || '5432');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid POSTGRES_PORT');
  if (env.POSTGRES_SSL && !['true', 'false'].includes(env.POSTGRES_SSL))
    throw new Error('Invalid POSTGRES_SSL');
  if (env.NODE_ENV === 'production' && env.POSTGRES_SSL !== 'true')
    throw new Error('Production database requires TLS');
  return {
    type: 'postgres',
    host: env.POSTGRES_HOST,
    port,
    database: env.POSTGRES_DB,
    username: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    ssl: env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: true } : false,
    entities: [
      ProductOrmEntity,
      CustomerOrmEntity,
      DeliveryOrmEntity,
      TransactionOrmEntity,
    ],
    migrations: [CreateProducts1794528000000, CreateCheckout1794528001000],
    connectTimeoutMS: 5000,
    extra: { statement_timeout: 10000 },
    synchronize: false,
    migrationsRun: false,
    logging: false,
  };
}
