import { Transform } from 'class-transformer';
import { IsString, Length, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class CustomerDto {
  @ApiProperty({ example: 'Ana Prueba' })
  @IsString()
  @Length(2, 120)
  fullName!: string;
  @ApiProperty({ example: 'ana@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @Length(3, 254)
  email!: string;
  @ApiProperty({ example: '+573001234567' })
  @IsString()
  @Length(7, 30)
  phone!: string;
}
