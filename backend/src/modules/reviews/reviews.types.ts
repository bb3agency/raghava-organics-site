export type CreateReviewInput = {
  productId: string;
  orderId: string;
  rating: number;
  body?: string;
  images?: string[];
};

export type ReviewListQuery = {
  page?: number;
  limit?: number;
};

export type AdminReviewListQuery = {
  approved?: boolean;
  page?: number;
  limit?: number;
};

export type ModerateReviewInput = {
  approved: boolean;
};
