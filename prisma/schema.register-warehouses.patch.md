# Shop model 增量（合入正式 tip 的 `prisma/schema.prisma`）

在现有 `model Shop` 末尾加两列，不要改其它字段：

```prisma
  // Tip #5: Settings 选仓，供 account/register 带 warehouseIds + defaultWarehouseId。
  registerWarehouseIds         String[] @default([])
  registerDefaultWarehouseId   String?
```
