import type { DataSource } from 'typeorm';
import { productCatalog } from './product-catalog';
export async function seedProducts(dataSource: DataSource): Promise<void> {
  const values = productCatalog.flatMap((product) => [
    product.id,
    product.sku,
    product.name,
    product.description,
    product.priceMinor,
    product.currency,
    product.stock,
    product.imageUrl,
  ]);
  const rows = productCatalog
    .map(
      (_, row) =>
        `(${Array.from({ length: 8 }, (_, column) => `$${row * 8 + column + 1}`).join(', ')})`,
    )
    .join(', ');
  // Los productos ya usados en reservas conservan su precio e inventario al repetir el seed.
  await dataSource.query(
    `INSERT INTO products (id, sku, name, description, price_minor, currency, stock_on_hand, image_url) VALUES ${rows} ON CONFLICT DO NOTHING`,
    values,
  );
}
