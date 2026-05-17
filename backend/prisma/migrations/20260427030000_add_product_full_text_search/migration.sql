ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
  to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
) STORED;

CREATE INDEX IF NOT EXISTS product_search_vector_gin_idx
ON "Product"
USING GIN (search_vector);
