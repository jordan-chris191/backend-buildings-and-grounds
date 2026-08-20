import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StockMovementsService } from './stock-movements.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { QueryStockMovementDto } from './dto/query-stock-movement.dto';


@Controller('stock-movements')
// @UseGuards(JwtAuthGuard)
export class StockMovementsController {
  constructor(private readonly stockMovementsService: StockMovementsService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateStockMovementDto) {
    // Extract user ID from the authenticated request
    const userId = req.user.id; // adjust based on your auth setup
    return this.stockMovementsService.create(userId, dto);
  }

  @Get()
  findAll(@Query() query: QueryStockMovementDto) {
    return this.stockMovementsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stockMovementsService.findOne(id);
  }
}