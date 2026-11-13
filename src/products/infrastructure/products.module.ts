import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../domain/product-repository.port';
import { GetProduct } from '../application/get-product';
import { ListProducts } from '../application/list-products';
import { ProductOrmEntity } from './product.orm-entity';
import { TypeOrmProductRepository } from './typeorm-product.repository';
import { ProductsController } from './products.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProductOrmEntity])],
  controllers: [ProductsController],
  providers: [
    { provide: PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository },
    {
      provide: ListProducts,
      useFactory: (port: ProductRepository) => new ListProducts(port),
      inject: [PRODUCT_REPOSITORY],
    },
    {
      provide: GetProduct,
      useFactory: (port: ProductRepository) => new GetProduct(port),
      inject: [PRODUCT_REPOSITORY],
    },
  ],
})
export class ProductsModule {}
