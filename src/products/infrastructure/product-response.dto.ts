import { ApiProperty } from '@nestjs/swagger';

export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({
    type: String,
    pattern: '^[0-9]+$',
    example: '8990000',
    description: 'Centavos COP exactos, serializados como cadena decimal.',
  })
  priceMinor!: string;
  @ApiProperty({ enum: ['COP'] }) currency!: 'COP';
  @ApiProperty({ minimum: 0 }) availableStock!: number;
}
