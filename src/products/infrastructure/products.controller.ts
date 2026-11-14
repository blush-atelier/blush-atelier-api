import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProductResponseDto } from './product-response.dto';
import { GetProduct } from '../application/get-product';
import { ListProducts } from '../application/list-products';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly listProducts: ListProducts,
    private readonly getProduct: GetProduct,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos y stock disponible' })
  @ApiResponse({
    status: 200,
    description: 'Precios en centavos como string; moneda COP.',
    type: [ProductResponseDto],
  })
  @ApiResponse({
    status: 503,
    description: 'Consulta temporalmente no disponible.',
  })
  async list() {
    const result = await this.listProducts.execute();
    if (!result.ok)
      throw new ServiceUnavailableException(
        'Productos temporalmente no disponibles',
      );
    return result.value;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un producto por UUID' })
  @ApiResponse({
    status: 200,
    description: 'Producto disponible.',
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 400, description: 'UUID inválido.' })
  @ApiResponse({ status: 404, description: 'Producto inexistente.' })
  @ApiResponse({
    status: 503,
    description: 'Consulta temporalmente no disponible.',
  })
  async get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    const result = await this.getProduct.execute(id);
    if (result.ok) return result.value;
    if (result.error === 'ProductNotFound')
      throw new NotFoundException('Producto no encontrado');
    throw new ServiceUnavailableException(
      'Producto temporalmente no disponible',
    );
  }
}
