import type { DataSource } from 'typeorm';

export async function seedProducts(dataSource: DataSource): Promise<void> {
  // Repetir el seed no reinicia stock ni precios de productos existentes.
  await dataSource.query(
    `
    INSERT INTO products (id, sku, name, description, price_minor, currency, stock_on_hand)
    VALUES ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT DO NOTHING
  `,
    [
      '11111111-1111-4111-8111-111111111111',
      'BLUSH-ROSE-01',
      'Rubor Rose',
      'Rubor suave de acabado natural.',
      '8990000',
      'COP',
      20,
      '22222222-2222-4222-8222-222222222222',
      'LIP-COCOA-01',
      'Labial Cocoa',
      'Labial cremoso en tono cocoa.',
      '5990000',
      'COP',
      15,
    ],
  );
}
