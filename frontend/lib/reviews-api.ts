import { apiClient } from "@/lib/api";

export interface ReviewAuthor {
  firstName: string;
  lastName: string;
}

export interface Review {
  id: string;
  productId: string;
  rating: number;
  body: string | null;
  images: string[];
  createdAt: string;
  author: ReviewAuthor;
}

export interface ReviewListResponse {
  items: Review[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getProductReviews(
  productSlug: string,
  query?: { page?: number; limit?: number },
): Promise<ReviewListResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return apiClient<ReviewListResponse>(
    `/reviews/product/${productSlug}${qs ? `?${qs}` : ""}`,
  );
}

export interface CreateReviewInput {
  productId: string;
  orderId: string;
  rating: number;
  body?: string;
  images?: string[];
}

export async function createReview(
  input: CreateReviewInput,
  accessToken: string,
): Promise<Review> {
  return apiClient<Review>("/reviews", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export async function getMyReviews(
  accessToken: string,
  query?: { page?: number; limit?: number },
): Promise<ReviewListResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return apiClient<ReviewListResponse>(`/reviews/me${qs ? `?${qs}` : ""}`, {
    method: "GET",
    accessToken,
  });
}
