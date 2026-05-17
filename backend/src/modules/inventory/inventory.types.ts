export type InventoryListQuery = {
  page?: number;
  limit?: number;
};

export type UpdateInventoryInput = {
  quantity?: number;
  lowStockThreshold?: number;
};

