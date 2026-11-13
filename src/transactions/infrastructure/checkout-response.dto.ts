import { ApiProperty } from '@nestjs/swagger';
export class QuoteResponseDto {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ minimum: 1 }) quantity!: number;
  @ApiProperty({ enum: ['COP'] }) currency!: string;
  @ApiProperty({ type: String, example: '8990000' }) unitPriceMinor!: string;
  @ApiProperty({ type: String, example: '8990000' })
  productAmountMinor!: string;
  @ApiProperty({ type: String, example: '500000' }) baseFeeMinor!: string;
  @ApiProperty({ type: String, example: '1000000' }) deliveryFeeMinor!: string;
  @ApiProperty({ type: String, example: '10490000' }) totalMinor!: string;
}
export class TransactionResponseDto extends QuoteResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({
    enum: ['PENDING', 'EXPIRED', 'APPROVED', 'DECLINED', 'ERROR'],
  })
  status!: string;
  @ApiProperty({ enum: ['ACTIVE', 'RELEASED', 'CONFIRMED'] })
  reservationStatus!: string;
  @ApiProperty({ format: 'date-time' }) reservationExpiresAt!: string;
}
